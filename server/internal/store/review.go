package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type ReviewTask struct {
	ID           string    `json:"id"`
	AttemptID    string    `json:"attempt_id"`
	ExamID       string    `json:"exam_id"`
	ExamTitle    string    `json:"exam_title"`
	UserID       string    `json:"user_id"`
	UserName     string    `json:"user_name"`
	QuestionID   string    `json:"question_id"`
	QuestionType string    `json:"question_type"`
	Status       string    `json:"status"`
	Score        *float64  `json:"score"`
	Comment      string    `json:"comment"`
	CreatedAt    time.Time `json:"created_at"`
}

type ReviewTaskDetail struct {
	ReviewTask
	Anonymous     bool             `json:"anonymous"`
	CandidateName string           `json:"candidate_name"`
	ExamRules     json.RawMessage  `json:"exam_rules"`
	AttemptStatus string           `json:"attempt_status"`
	Question      SnapshotQuestion `json:"question"`
	Answer        json.RawMessage  `json:"answer"`
}

type ReviewFilter struct {
	Status   string
	ExamID   string
	Page     int
	PageSize int
}

type ReviewSubmitResult struct {
	TaskID        string  `json:"task_id"`
	Score         float64 `json:"score"`
	AttemptTotal  float64 `json:"attempt_total"`
	PendingReview int     `json:"pending_review"`
}

func (s *Store) ListReviewTasks(ctx context.Context, orgID string, f ReviewFilter) ([]ReviewTask, int64, error) {
	where := []string{"e.org_id = $1"}
	args := []any{orgID}
	if f.Status != "" {
		args = append(args, f.Status)
		where = append(where, fmt.Sprintf("rt.status = $%d", len(args)))
	}
	if f.ExamID != "" {
		args = append(args, f.ExamID)
		where = append(where, fmt.Sprintf("e.id = $%d::uuid", len(args)))
	}
	whereSQL := strings.Join(where, " AND ")

	base := `
		FROM review_tasks rt
		JOIN attempts a ON a.id = rt.attempt_id
		JOIN exams e ON e.id = a.exam_id
		JOIN users u ON u.id = a.user_id
		JOIN questions q ON q.id = rt.question_id
		WHERE ` + whereSQL

	var total int64
	if err := s.pool.QueryRow(ctx, `SELECT count(*) `+base, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count review tasks: %w", err)
	}

	args = append(args, f.PageSize, (f.Page-1)*f.PageSize)
	rows, err := s.pool.Query(ctx, `
		SELECT rt.id::text, rt.attempt_id::text, e.id::text, e.title, u.id::text, u.name,
			rt.question_id::text, q.type, rt.status, rt.score::float8, rt.comment, rt.created_at
		`+base+`
		ORDER BY rt.created_at
		LIMIT $`+fmt.Sprint(len(args)-1)+` OFFSET $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list review tasks: %w", err)
	}
	defer rows.Close()

	tasks := make([]ReviewTask, 0, f.PageSize)
	for rows.Next() {
		var task ReviewTask
		if err := rows.Scan(&task.ID, &task.AttemptID, &task.ExamID, &task.ExamTitle, &task.UserID, &task.UserName,
			&task.QuestionID, &task.QuestionType, &task.Status, &task.Score, &task.Comment, &task.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan review task: %w", err)
		}
		tasks = append(tasks, task)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("iterate review tasks: %w", err)
	}
	return tasks, total, nil
}

func (s *Store) GetReviewTaskDetail(ctx context.Context, orgID, taskID string) (ReviewTaskDetail, error) {
	var detail ReviewTaskDetail
	var rulesRaw []byte
	err := s.pool.QueryRow(ctx, `
		SELECT rt.id::text, rt.attempt_id::text, e.id::text, e.title, u.id::text, u.name,
			rt.question_id::text, q.type, rt.status, rt.score::float8, rt.comment, rt.created_at,
			e.rules, a.status
		FROM review_tasks rt
		JOIN attempts a ON a.id = rt.attempt_id
		JOIN exams e ON e.id = a.exam_id
		JOIN users u ON u.id = a.user_id
		JOIN questions q ON q.id = rt.question_id
		WHERE rt.id = $1::uuid AND e.org_id = $2`, taskID, orgID,
	).Scan(&detail.ID, &detail.AttemptID, &detail.ExamID, &detail.ExamTitle, &detail.UserID, &detail.UserName,
		&detail.QuestionID, &detail.QuestionType, &detail.Status, &detail.Score, &detail.Comment, &detail.CreatedAt,
		&rulesRaw, &detail.AttemptStatus)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ReviewTaskDetail{}, ErrNotFound
		}
		return ReviewTaskDetail{}, fmt.Errorf("load review task: %w", err)
	}
	detail.ExamRules = rulesRaw

	var anonymity struct {
		AnonymousReview *bool `json:"anonymous_review"`
	}
	_ = json.Unmarshal(rulesRaw, &anonymity)
	detail.Anonymous = anonymity.AnonymousReview == nil || *anonymity.AnonymousReview
	detail.CandidateName = detail.UserName
	if detail.Anonymous {
		detail.CandidateName = "匿名考生"
	}

	snapshot, err := s.GetSnapshot(ctx, detail.ExamID)
	if err != nil {
		return ReviewTaskDetail{}, err
	}
	found := false
	for _, question := range snapshot.Questions {
		if question.QuestionID == detail.QuestionID {
			detail.Question = question
			found = true
			break
		}
	}
	if !found {
		return ReviewTaskDetail{}, ErrNotFound
	}

	var answer json.RawMessage
	err = s.pool.QueryRow(ctx, `SELECT content FROM answers WHERE attempt_id = $1 AND question_id = $2`,
		detail.AttemptID, detail.QuestionID).Scan(&answer)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return ReviewTaskDetail{}, fmt.Errorf("load review answer: %w", err)
	}
	if len(answer) == 0 {
		answer = json.RawMessage(`{}`)
	}
	detail.Answer = answer
	return detail, nil
}

func (s *Store) SubmitReview(ctx context.Context, orgID, reviewerID, taskID string, score float64, comment string) (ReviewSubmitResult, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ReviewSubmitResult{}, fmt.Errorf("begin submit review: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var (
		attemptID  string
		examID     string
		questionID string
		taskStatus string
		reviewer   *string
	)
	err = tx.QueryRow(ctx, `
		SELECT rt.attempt_id::text, e.id::text, rt.question_id::text, rt.status, rt.reviewer_id::text
		FROM review_tasks rt
		JOIN attempts a ON a.id = rt.attempt_id
		JOIN exams e ON e.id = a.exam_id
		WHERE rt.id = $1::uuid AND e.org_id = $2
		FOR UPDATE OF rt`, taskID, orgID,
	).Scan(&attemptID, &examID, &questionID, &taskStatus, &reviewer)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ReviewSubmitResult{}, ErrNotFound
		}
		return ReviewSubmitResult{}, fmt.Errorf("load review task for submit: %w", err)
	}
	if taskStatus != "pending" && taskStatus != "in_progress" {
		return ReviewSubmitResult{}, ErrInvalidState
	}
	if reviewer != nil && *reviewer != reviewerID {
		return ReviewSubmitResult{}, ErrForbidden
	}

	var payload []byte
	if err := tx.QueryRow(ctx, `SELECT payload FROM paper_snapshots WHERE exam_id = $1`, examID).Scan(&payload); err != nil {
		return ReviewSubmitResult{}, fmt.Errorf("load snapshot for review: %w", err)
	}
	var snapshot PaperSnapshot
	if err := json.Unmarshal(payload, &snapshot); err != nil {
		return ReviewSubmitResult{}, fmt.Errorf("parse snapshot for review: %w", err)
	}
	var snapshotQuestion *SnapshotQuestion
	for index := range snapshot.Questions {
		if snapshot.Questions[index].QuestionID == questionID {
			snapshotQuestion = &snapshot.Questions[index]
			break
		}
	}
	if snapshotQuestion == nil {
		return ReviewSubmitResult{}, ErrNotFound
	}
	if score < 0 || score > snapshotQuestion.Score {
		return ReviewSubmitResult{}, fmt.Errorf("score must be between 0 and %.2f: %w", snapshotQuestion.Score, ErrInvalidState)
	}
	score = math.Round(score*100) / 100

	if _, err := tx.Exec(ctx, `
		UPDATE review_tasks
		SET reviewer_id = $1, score = $2, comment = $3, status = 'submitted'
		WHERE id = $4`, reviewerID, score, comment, taskID); err != nil {
		return ReviewSubmitResult{}, fmt.Errorf("update review task: %w", err)
	}

	var (
		recordID   string
		detailRaw  []byte
		recordStat string
	)
	err = tx.QueryRow(ctx, `
		SELECT id::text, detail, status FROM score_records
		WHERE attempt_id = $1 ORDER BY created_at DESC LIMIT 1
		FOR UPDATE`, attemptID).Scan(&recordID, &detailRaw, &recordStat)
	if err != nil {
		return ReviewSubmitResult{}, fmt.Errorf("load score record for review: %w", err)
	}
	if recordStat == "published" {
		return ReviewSubmitResult{}, ErrInvalidState
	}
	var detail ScoreDetail
	if err := json.Unmarshal(detailRaw, &detail); err != nil {
		return ReviewSubmitResult{}, fmt.Errorf("parse score detail for review: %w", err)
	}
	updated := false
	total := 0.0
	for index := range detail.Questions {
		item := &detail.Questions[index]
		if item.QuestionID == questionID {
			item.Score = score
			item.NeedsReview = false
			item.Auto = false
			updated = true
		}
		total += item.Score
	}
	if !updated {
		return ReviewSubmitResult{}, ErrNotFound
	}
	total = round2(total)
	detailRaw, err = json.Marshal(detail)
	if err != nil {
		return ReviewSubmitResult{}, fmt.Errorf("marshal reviewed score detail: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE score_records SET total = $1, detail = $2::jsonb WHERE id = $3`,
		total, string(detailRaw), recordID); err != nil {
		return ReviewSubmitResult{}, fmt.Errorf("update score record: %w", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE attempts SET score = $1 WHERE id = $2`, total, attemptID); err != nil {
		return ReviewSubmitResult{}, fmt.Errorf("update attempt score: %w", err)
	}

	var pending int
	if err := tx.QueryRow(ctx, `
		SELECT count(*) FROM review_tasks
		WHERE attempt_id = $1 AND status IN ('pending', 'in_progress')`, attemptID).Scan(&pending); err != nil {
		return ReviewSubmitResult{}, fmt.Errorf("count pending review tasks: %w", err)
	}
	if pending == 0 {
		if _, err := tx.Exec(ctx, `UPDATE attempts SET status = 'graded' WHERE id = $1 AND status = 'submitted'`, attemptID); err != nil {
			return ReviewSubmitResult{}, fmt.Errorf("mark attempt graded: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return ReviewSubmitResult{}, fmt.Errorf("commit submit review: %w", err)
	}
	return ReviewSubmitResult{
		TaskID:        taskID,
		Score:         score,
		AttemptTotal:  total,
		PendingReview: pending,
	}, nil
}
