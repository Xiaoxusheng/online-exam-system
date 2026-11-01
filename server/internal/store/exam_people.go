package store

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// ExamStaff is a proctor or reviewer assigned to one exam.
type ExamStaff struct {
	UserID     string    `json:"user_id"`
	Name       string    `json:"name"`
	Username   string    `json:"username"`
	Role       string    `json:"role"`
	AssignedAt time.Time `json:"assigned_at"`
}

const (
	staffKindProctor  = "proctor"
	staffKindReviewer = "reviewer"
)

// staffTables maps a kind to its table and the only role allowed to be assigned.
// Both values are constants, never request input.
func staffTables(kind string) (table, role string, ok bool) {
	switch kind {
	case staffKindProctor:
		return "exam_proctors", "proctor", true
	case staffKindReviewer:
		return "exam_reviewers", "reviewer", true
	default:
		return "", "", false
	}
}

func (s *Store) SetExamProctors(ctx context.Context, orgID, examID string, userIDs []string) ([]ExamStaff, error) {
	return s.setExamStaff(ctx, orgID, examID, staffKindProctor, userIDs)
}

func (s *Store) SetExamReviewers(ctx context.Context, orgID, examID string, userIDs []string) ([]ExamStaff, error) {
	return s.setExamStaff(ctx, orgID, examID, staffKindReviewer, userIDs)
}

func (s *Store) ListExamProctors(ctx context.Context, orgID, examID string) ([]ExamStaff, error) {
	return s.listExamStaff(ctx, orgID, examID, staffKindProctor)
}

func (s *Store) ListExamReviewers(ctx context.Context, orgID, examID string) ([]ExamStaff, error) {
	return s.listExamStaff(ctx, orgID, examID, staffKindReviewer)
}

func (s *Store) setExamStaff(ctx context.Context, orgID, examID, kind string, userIDs []string) ([]ExamStaff, error) {
	table, role, ok := staffTables(kind)
	if !ok {
		return nil, fmt.Errorf("unknown exam staff kind %q", kind)
	}

	var examExists bool
	if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM exams WHERE id = $1::uuid AND org_id = $2::uuid)`, examID, orgID).
		Scan(&examExists); err != nil {
		return nil, fmt.Errorf("check exam for %s assignment: %w", kind, err)
	}
	if !examExists {
		return nil, ErrNotFound
	}

	unique := make([]string, 0, len(userIDs))
	seen := make(map[string]struct{}, len(userIDs))
	for _, id := range userIDs {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		unique = append(unique, id)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin set exam %s: %w", kind, err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	if len(unique) > 0 {
		var valid int
		err = tx.QueryRow(ctx, `
			SELECT count(*) FROM users
			WHERE org_id = $2::uuid AND role = $3 AND status = 'active' AND id::text = ANY($1::text[])`,
			unique, orgID, role).Scan(&valid)
		if err != nil {
			return nil, fmt.Errorf("validate exam %s: %w", kind, err)
		}
		if valid != len(unique) {
			return nil, fmt.Errorf("every assigned user must be an active %s in this organization: %w", role, ErrInvalidState)
		}
	}

	if _, err := tx.Exec(ctx, `DELETE FROM `+table+` WHERE exam_id = $1::uuid`, examID); err != nil {
		return nil, fmt.Errorf("clear exam %s: %w", kind, err)
	}
	for _, userID := range unique {
		if _, err := tx.Exec(ctx, `
			INSERT INTO `+table+` (exam_id, user_id) VALUES ($1::uuid, $2::uuid)
			ON CONFLICT DO NOTHING`, examID, userID); err != nil {
			return nil, fmt.Errorf("insert exam %s: %w", kind, err)
		}
	}
	if kind == staffKindReviewer {
		// A reviewer dropped from the list keeps their pending tasks otherwise, and
		// SubmitReview only accepts the assigned reviewer — nobody, including an
		// administrator, could finish them, so the answer sheet never turns graded and
		// the whole exam can no longer publish scores. Release them back to the pool.
		if _, err := tx.Exec(ctx, `
			UPDATE review_tasks rt
			SET reviewer_id = NULL, status = 'pending', updated_at = now()
			FROM attempts a
			WHERE rt.attempt_id = a.id AND a.exam_id = $1::uuid
				AND rt.status IN ('pending', 'in_progress')
				AND rt.reviewer_id IS NOT NULL
				AND NOT (rt.reviewer_id::text = ANY($2::text[]))`, examID, unique); err != nil {
			return nil, fmt.Errorf("release orphan review tasks: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit exam %s: %w", kind, err)
	}
	return s.listExamStaff(ctx, orgID, examID, kind)
}

func (s *Store) listExamStaff(ctx context.Context, orgID, examID, kind string) ([]ExamStaff, error) {
	table, _, ok := staffTables(kind)
	if !ok {
		return nil, fmt.Errorf("unknown exam staff kind %q", kind)
	}
	rows, err := s.pool.Query(ctx, `
		SELECT es.user_id::text, u.name, u.username, u.role, es.created_at
		FROM `+table+` es
		JOIN users u ON u.id = es.user_id
		JOIN exams e ON e.id = es.exam_id AND e.org_id = $2::uuid
		WHERE es.exam_id = $1::uuid
		ORDER BY es.created_at`, examID, orgID)
	if err != nil {
		return nil, fmt.Errorf("list exam %s: %w", kind, err)
	}
	defer rows.Close()

	items := make([]ExamStaff, 0)
	for rows.Next() {
		var item ExamStaff
		if err := rows.Scan(&item.UserID, &item.Name, &item.Username, &item.Role, &item.AssignedAt); err != nil {
			return nil, fmt.Errorf("scan exam %s: %w", kind, err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate exam %s: %w", kind, err)
	}
	return items, nil
}

// CanProctorExam reports whether a proctor may watch one exam room.
// Exams without an explicit assignment stay open to every proctor of the organization;
// once proctors are assigned, only they can enter.
func (s *Store) CanProctorExam(ctx context.Context, orgID, examID, userID string) (bool, error) {
	var allowed bool
	err := s.pool.QueryRow(ctx, `
		SELECT (SELECT count(*) FROM exam_proctors ep JOIN exams e ON e.id = ep.exam_id
				WHERE ep.exam_id = $1::uuid AND e.org_id = $2::uuid) = 0
			OR EXISTS(SELECT 1 FROM exam_proctors WHERE exam_id = $1::uuid AND user_id = $3::uuid)`,
		examID, orgID, userID).Scan(&allowed)
	if err != nil {
		return false, fmt.Errorf("check proctor scope: %w", err)
	}
	return allowed, nil
}

// pickReviewer returns the least loaded assigned reviewer who has not already scored
// an earlier round of the same question. Exams without assigned reviewers keep the
// v0.3 behaviour: the task stays unassigned and claimable by any reviewer.
func pickReviewer(ctx context.Context, db DBTX, examID string, exclude []string) (string, bool) {
	if exclude == nil {
		exclude = []string{}
	}
	var userID string
	err := db.QueryRow(ctx, `
		SELECT er.user_id::text
		FROM exam_reviewers er
		JOIN users u ON u.id = er.user_id AND u.status = 'active'
		LEFT JOIN LATERAL (
			SELECT count(*) AS pending FROM review_tasks rt
			WHERE rt.reviewer_id = er.user_id AND rt.status IN ('pending', 'in_progress')
		) lw ON true
		WHERE er.exam_id = $1::uuid AND NOT (er.user_id::text = ANY($2::text[]))
		ORDER BY lw.pending, er.created_at
		LIMIT 1`, examID, exclude,
	).Scan(&userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", false
		}
		return "", false
	}
	return userID, true
}
