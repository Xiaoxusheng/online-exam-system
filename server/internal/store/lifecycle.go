package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// LifecycleResult reports what the periodic exam governance sweep changed.
type LifecycleResult struct {
	ClosedExams      int64 `json:"closed_exams"`
	AbsentCandidates int64 `json:"absent_candidates"`
}

// CloseExpiredExams ends exams whose window has passed and marks candidates who never
// entered as absent. Candidates still answering are left alone: FinalizeExpiredAttempts
// auto-submits them and the next sweep closes the exam once nobody is testing.
func (s *Store) CloseExpiredExams(ctx context.Context) (LifecycleResult, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT e.id::text, e.title
		FROM exams e
		WHERE e.end_at <= now() AND e.status IN ('pending_start', 'in_progress')
		ORDER BY e.end_at
		LIMIT 100`)
	if err != nil {
		return LifecycleResult{}, fmt.Errorf("find expired exams: %w", err)
	}

	type expiredExam struct {
		id    string
		title string
	}
	exams := make([]expiredExam, 0, 8)
	for rows.Next() {
		var item expiredExam
		if err := rows.Scan(&item.id, &item.title); err != nil {
			rows.Close()
			return LifecycleResult{}, fmt.Errorf("scan expired exam: %w", err)
		}
		exams = append(exams, item)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return LifecycleResult{}, fmt.Errorf("iterate expired exams: %w", err)
	}
	rows.Close()

	var result LifecycleResult
	var firstErr error
	for _, exam := range exams {
		absent, closed, err := s.closeOneExam(ctx, exam.id, exam.title)
		if err != nil {
			if firstErr == nil {
				firstErr = fmt.Errorf("close exam %s: %w", exam.id, err)
			}
			continue
		}
		result.AbsentCandidates += absent
		if closed {
			result.ClosedExams++
		}
	}
	return result, firstErr
}

func (s *Store) closeOneExam(ctx context.Context, examID, examTitle string) (int64, bool, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, false, fmt.Errorf("begin close exam: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var status string
	err = tx.QueryRow(ctx, `SELECT status FROM exams WHERE id = $1::uuid FOR UPDATE`, examID).Scan(&status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, false, nil
		}
		return 0, false, fmt.Errorf("lock exam for close: %w", err)
	}
	if status != "pending_start" && status != "in_progress" {
		return 0, false, nil
	}

	tag, err := tx.Exec(ctx, `
		UPDATE exam_candidates
		SET status = 'absent'
		WHERE exam_id = $1::uuid AND status IN ('assigned', 'waiting') AND attempt_id IS NULL`, examID)
	if err != nil {
		return 0, false, fmt.Errorf("mark absent candidates: %w", err)
	}
	absent := tag.RowsAffected()

	var active int
	if err := tx.QueryRow(ctx, `
		SELECT count(*) FROM exam_candidates
		WHERE exam_id = $1::uuid AND status IN ('assigned', 'waiting', 'testing')`, examID).Scan(&active); err != nil {
		return 0, false, fmt.Errorf("count active candidates on close: %w", err)
	}
	if active > 0 {
		// Someone is still answering; closing now would hide the in-progress attempts.
		if err := tx.Commit(ctx); err != nil {
			return 0, false, fmt.Errorf("commit absent marking: %w", err)
		}
		return absent, false, nil
	}

	if _, err := tx.Exec(ctx, `
		UPDATE exams SET status = 'ended'
		WHERE id = $1::uuid AND status IN ('pending_start', 'in_progress')`, examID); err != nil {
		return 0, false, fmt.Errorf("mark exam ended: %w", err)
	}

	candidates, err := countExamCandidates(ctx, tx, examID)
	if err != nil {
		return 0, false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, false, fmt.Errorf("commit close exam: %w", err)
	}

	s.emit(RealtimeEvent{
		Type:   EventExamClosed,
		ExamID: examID,
		Detail: map[string]any{
			"reason":     "exam_window_expired",
			"exam_title": examTitle,
			"absent":     absent,
			"candidates": candidates,
		},
	})
	return absent, true, nil
}

func countExamCandidates(ctx context.Context, db DBTX, examID string) (int64, error) {
	var count int64
	if err := db.QueryRow(ctx, `SELECT count(*) FROM exam_candidates WHERE exam_id = $1::uuid`, examID).Scan(&count); err != nil {
		return 0, fmt.Errorf("count exam candidates: %w", err)
	}
	return count, nil
}
