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
	Round        int       `json:"round"`
	Status       string    `json:"status"`
	ReviewerID   string    `json:"reviewer_id"`
	ReviewerName string    `json:"reviewer_name"`
	Score        *float64  `json:"score"`
	Comment      string    `json:"comment"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type ReviewRound struct {
	Round        int      `json:"round"`
	TaskID       string   `json:"task_id"`
	Status       string   `json:"status"`
	ReviewerID   string   `json:"reviewer_id"`
	ReviewerName string   `json:"reviewer_name"`
	Score        *float64 `json:"score"`
	Comment      string   `json:"comment"`
}

type ReviewTaskDetail struct {
	ReviewTask
	Anonymous      bool             `json:"anonymous"`
	CandidateName  string           `json:"candidate_name"`
	ExamRules      json.RawMessage  `json:"exam_rules"`
	AttemptStatus  string           `json:"attempt_status"`
	ReviewMode     string           `json:"review_mode"`
	Threshold      float64          `json:"review_threshold"`
	NeedsArbitrate bool             `json:"needs_arbitrate"`
	Rounds         []ReviewRound    `json:"rounds"`
	Question       SnapshotQuestion `json:"question"`
	Answer         json.RawMessage  `json:"answer"`
}

type ReviewFilter struct {
	Status     string
	ExamID     string
	ReviewerID string // empty means unrestricted (administrators)
	Page       int
	PageSize   int
}

type ReviewSubmitResult struct {
	TaskID        string   `json:"task_id"`
	Round         int      `json:"round"`
	Score         float64  `json:"score"`
	FinalScore    *float64 `json:"final_score"`
	Finalized     bool     `json:"finalized"`
	Arbitration   bool     `json:"arbitration"`
	NextTaskID    string   `json:"next_task_id,omitempty"`
	AttemptTotal  float64  `json:"attempt_total"`
	PendingReview int      `json:"pending_review"`
}

// reviewRules reads the double-review settings from exams.rules.
// review_mode: "single" (default) or "double"; double creates a second round and,
// when the gap exceeds review_threshold, a third arbitration round.
// An absent or non-positive threshold falls back to 20% of the question score.
type reviewRules struct {
	Mode             string
	ConfiguredGap    float64
	HasConfiguredGap bool
}

func parseReviewRules(raw json.RawMessage) reviewRules {
	var parsed struct {
		ReviewMode      *string  `json:"review_mode"`
		ReviewThreshold *float64 `json:"review_threshold"`
	}
	_ = json.Unmarshal(raw, &parsed)
	rules := reviewRules{Mode: "single"}
	if parsed.ReviewMode != nil && *parsed.ReviewMode == "double" {
		rules.Mode = "double"
	}
	if parsed.ReviewThreshold != nil && *parsed.ReviewThreshold > 0 {
		rules.ConfiguredGap = *parsed.ReviewThreshold
		rules.HasConfiguredGap = true
	}
	return rules
}

func (r reviewRules) thresholdFor(maxScore float64) float64 {
	if r.HasConfiguredGap {
		return round2(r.ConfiguredGap)
	}
	return round2(maxScore * 0.2)
}

// candidateDisplayName hides the candidate identity while anonymous review is on
// (the default when exams.rules has no anonymous_review key).
func candidateDisplayName(name string, rulesRaw []byte) string {
	if isAnonymousReview(rulesRaw) {
		return "匿名考生"
	}
	return name
}

func isAnonymousReview(rulesRaw []byte) bool {
	var parsed struct {
		AnonymousReview *bool `json:"anonymous_review"`
	}
	_ = json.Unmarshal(rulesRaw, &parsed)
	return parsed.AnonymousReview == nil || *parsed.AnonymousReview
}

// reviewQueueOrder must stay identical for the list and the neighbour lookup: tasks created in
// one transaction share created_at, so without the id tiebreaker the two queries disagree.
const reviewQueueOrder = `ORDER BY rt.created_at, rt.round, rt.id`

func reviewTaskWhere(orgID string, f ReviewFilter) (string, []any) {
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
	if f.ReviewerID != "" {
		// Assigned tasks are private; unassigned tasks stay in the shared claim pool.
		args = append(args, f.ReviewerID)
		where = append(where, fmt.Sprintf("(rt.reviewer_id = $%d::uuid OR rt.reviewer_id IS NULL)", len(args)))
	}
	base := `
		FROM review_tasks rt
		JOIN attempts a ON a.id = rt.attempt_id
		JOIN exams e ON e.id = a.exam_id
		JOIN users u ON u.id = a.user_id
		JOIN questions q ON q.id = rt.question_id
		LEFT JOIN users ru ON ru.id = rt.reviewer_id
		WHERE ` + strings.Join(where, " AND ")
	return base, args
}

func (s *Store) ListReviewTasks(ctx context.Context, orgID string, f ReviewFilter) ([]ReviewTask, int64, error) {
	base, args := reviewTaskWhere(orgID, f)

	var total int64
	if err := s.pool.QueryRow(ctx, `SELECT count(*) `+base, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count review tasks: %w", err)
	}

	args = append(args, f.PageSize, (f.Page-1)*f.PageSize)
	rows, err := s.pool.Query(ctx, `
		SELECT rt.id::text, rt.attempt_id::text, e.id::text, e.title, u.id::text, u.name,
			rt.question_id::text, q.type, rt.round::int, rt.status, COALESCE(rt.reviewer_id::text, ''),
			COALESCE(ru.name, ''), rt.score::float8, rt.comment, rt.created_at, rt.updated_at, e.rules
		`+base+`
		`+reviewQueueOrder+`
		LIMIT $`+fmt.Sprint(len(args)-1)+` OFFSET $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list review tasks: %w", err)
	}
	defer rows.Close()

	tasks := make([]ReviewTask, 0, f.PageSize)
	for rows.Next() {
		var task ReviewTask
		var taskRules []byte
		if err := rows.Scan(&task.ID, &task.AttemptID, &task.ExamID, &task.ExamTitle, &task.UserID, &task.UserName,
			&task.QuestionID, &task.QuestionType, &task.Round, &task.Status, &task.ReviewerID, &task.ReviewerName,
			&task.Score, &task.Comment, &task.CreatedAt, &task.UpdatedAt, &taskRules); err != nil {
			return nil, 0, fmt.Errorf("scan review task: %w", err)
		}
		task.UserName = candidateDisplayName(task.UserName, taskRules)
		tasks = append(tasks, task)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("iterate review tasks: %w", err)
	}
	return tasks, total, nil
}

// GetReviewTaskDetail loads one task with every review round of the same question.
// reviewerID restricts plain reviewers to their own (or claimable) tasks; pass "" for administrators.
// ReviewQueue is the sequential position of one task inside the queue a reviewer is browsing,
// which lets the drawer offer 上一份/下一份 without re-fetching the whole list.
type ReviewQueue struct {
	Position int    `json:"position"`
	Total    int    `json:"total"`
	PrevID   string `json:"prev_id"`
	NextID   string `json:"next_id"`
}

func (s *Store) ReviewTaskNeighbors(ctx context.Context, orgID string, f ReviewFilter, taskID string) (ReviewQueue, error) {
	base, args := reviewTaskWhere(orgID, f)
	args = append(args, reviewQueueScanLimit)
	rows, err := s.pool.Query(ctx, `SELECT rt.id::text `+base+`
		`+reviewQueueOrder+`
		LIMIT $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return ReviewQueue{}, fmt.Errorf("load review queue: %w", err)
	}
	defer rows.Close()

	ids := make([]string, 0, 64)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return ReviewQueue{}, fmt.Errorf("scan review queue: %w", err)
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return ReviewQueue{}, fmt.Errorf("iterate review queue: %w", err)
	}

	queue := ReviewQueue{Total: len(ids)}
	for index, id := range ids {
		if id != taskID {
			continue
		}
		queue.Position = index + 1
		if index > 0 {
			queue.PrevID = ids[index-1]
		}
		if index+1 < len(ids) {
			queue.NextID = ids[index+1]
		}
		return queue, nil
	}
	return ReviewQueue{}, ErrNotFound
}

const reviewQueueScanLimit = 2000

func (s *Store) GetReviewTaskDetail(ctx context.Context, orgID, taskID, reviewerID string) (ReviewTaskDetail, error) {
	var detail ReviewTaskDetail
	var rulesRaw []byte
	var assignedTo *string
	var paperGroup string
	err := s.pool.QueryRow(ctx, `
		SELECT rt.id::text, rt.attempt_id::text, e.id::text, e.title, u.id::text, u.name,
			rt.question_id::text, q.type, rt.round::int, rt.status, rt.score::float8, rt.comment,
			rt.created_at, rt.updated_at, e.rules, a.status, rt.reviewer_id::text, COALESCE(ru.name, ''), a.paper_group
		FROM review_tasks rt
		JOIN attempts a ON a.id = rt.attempt_id
		JOIN exams e ON e.id = a.exam_id
		JOIN users u ON u.id = a.user_id
		JOIN questions q ON q.id = rt.question_id
		LEFT JOIN users ru ON ru.id = rt.reviewer_id
		WHERE rt.id = $1::uuid AND e.org_id = $2`, taskID, orgID,
	).Scan(&detail.ID, &detail.AttemptID, &detail.ExamID, &detail.ExamTitle, &detail.UserID, &detail.UserName,
		&detail.QuestionID, &detail.QuestionType, &detail.Round, &detail.Status, &detail.Score, &detail.Comment,
		&detail.CreatedAt, &detail.UpdatedAt, &rulesRaw, &detail.AttemptStatus, &assignedTo, &detail.ReviewerName, &paperGroup)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ReviewTaskDetail{}, ErrNotFound
		}
		return ReviewTaskDetail{}, fmt.Errorf("load review task: %w", err)
	}
	if assignedTo != nil {
		detail.ReviewerID = *assignedTo
	}
	rules := parseReviewRules(rulesRaw)
	detail.ReviewMode = rules.Mode
	if reviewerID != "" && assignedTo != nil && *assignedTo != reviewerID {
		return ReviewTaskDetail{}, ErrForbidden
	}

	detail.Anonymous = isAnonymousReview(rulesRaw)
	detail.CandidateName = candidateDisplayName(detail.UserName, rulesRaw)
	detail.UserName = detail.CandidateName

	snapshot, err := s.GetSnapshot(ctx, detail.ExamID)
	if err != nil {
		return ReviewTaskDetail{}, err
	}
	found := false
	for _, question := range snapshot.Questions {
		// The same question may sit in both AB groups with different scores; take the one
		// the candidate was actually handed.
		if question.QuestionID == detail.QuestionID && question.PaperGroup == paperGroup {
			detail.Question = question
			found = true
			break
		}
	}
	if !found {
		return ReviewTaskDetail{}, ErrNotFound
	}

	detail.Threshold = rules.thresholdFor(detail.Question.Score)
	rounds, err := s.listReviewRounds(ctx, detail.AttemptID, detail.QuestionID)
	if err != nil {
		return ReviewTaskDetail{}, err
	}
	detail.Rounds = rounds
	for _, round := range rounds {
		if round.Status == "pending" || round.Status == "in_progress" {
			detail.NeedsArbitrate = round.Round == 3
		}
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

func (s *Store) listReviewRounds(ctx context.Context, attemptID, questionID string) ([]ReviewRound, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT rt.round::int, rt.id::text, rt.status, rt.reviewer_id::text, COALESCE(u.name, ''),
			rt.score::float8, rt.comment
		FROM review_tasks rt
		LEFT JOIN users u ON u.id = rt.reviewer_id
		WHERE rt.attempt_id = $1::uuid AND rt.question_id = $2::uuid
		ORDER BY rt.round`, attemptID, questionID)
	if err != nil {
		return nil, fmt.Errorf("list review rounds: %w", err)
	}
	defer rows.Close()

	rounds := make([]ReviewRound, 0, 3)
	for rows.Next() {
		var item ReviewRound
		var reviewerID *string
		if err := rows.Scan(&item.Round, &item.TaskID, &item.Status, &reviewerID, &item.ReviewerName, &item.Score, &item.Comment); err != nil {
			return nil, fmt.Errorf("scan review round: %w", err)
		}
		if reviewerID != nil {
			item.ReviewerID = *reviewerID
		}
		rounds = append(rounds, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate review rounds: %w", err)
	}
	return rounds, nil
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
		round      int
		taskStatus string
		assigned   *string
		rulesRaw   []byte
		paperGroup string
	)
	// Locking the attempt alongside the task serialises every review of the same answer
	// sheet. Without it two reviewers finishing the last two tasks at the same instant
	// each still see the other's task as pending, so the submitted -> graded transition
	// below never runs and the candidate's score can never be published.
	err = tx.QueryRow(ctx, `
		SELECT rt.attempt_id::text, e.id::text, rt.question_id::text, rt.round::int, rt.status,
			rt.reviewer_id::text, e.rules, a.paper_group
		FROM review_tasks rt
		JOIN attempts a ON a.id = rt.attempt_id
		JOIN exams e ON e.id = a.exam_id
		WHERE rt.id = $1::uuid AND e.org_id = $2
		FOR UPDATE OF rt, a`, taskID, orgID,
	).Scan(&attemptID, &examID, &questionID, &round, &taskStatus, &assigned, &rulesRaw, &paperGroup)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ReviewSubmitResult{}, ErrNotFound
		}
		return ReviewSubmitResult{}, fmt.Errorf("load review task for submit: %w", err)
	}
	if taskStatus != "pending" && taskStatus != "in_progress" {
		return ReviewSubmitResult{}, ErrInvalidState
	}
	if assigned != nil && *assigned != reviewerID {
		return ReviewSubmitResult{}, ErrForbidden
	}
	if round > 1 {
		// Double review only means something when a second person judges the answer.
		// A reviewer may not take an extra round while another reviewer is still
		// available for this exam; when the exam configured only this one person the
		// round is effectively a single review and is allowed through.
		var otherReviewers int
		if err := tx.QueryRow(ctx, `
			SELECT count(*) FROM exam_reviewers er
			JOIN users u ON u.id = er.user_id AND u.status = 'active'
			WHERE er.exam_id = $1::uuid AND er.user_id <> $2::uuid`, examID, reviewerID).Scan(&otherReviewers); err != nil {
			return ReviewSubmitResult{}, fmt.Errorf("count other reviewers: %w", err)
		}
		if otherReviewers > 0 {
			var judgedBefore bool
			if err := tx.QueryRow(ctx, `
				SELECT EXISTS(
					SELECT 1 FROM review_tasks
					WHERE attempt_id = $1::uuid AND question_id = $2::uuid
						AND round < $3 AND reviewer_id = $4::uuid)`,
				attemptID, questionID, round, reviewerID).Scan(&judgedBefore); err != nil {
				return ReviewSubmitResult{}, fmt.Errorf("check earlier review rounds: %w", err)
			}
			if judgedBefore {
				return ReviewSubmitResult{}, fmt.Errorf("%w: 同一题目不能由同一阅卷人评多轮", ErrForbidden)
			}
		}
	}

	var payload []byte
	if err := tx.QueryRow(ctx, `SELECT payload FROM paper_snapshots WHERE exam_id = $1`, examID).Scan(&payload); err != nil {
		return ReviewSubmitResult{}, fmt.Errorf("load snapshot for review: %w", err)
	}
	var snapshot PaperSnapshot
	if err := json.Unmarshal(payload, &snapshot); err != nil {
		return ReviewSubmitResult{}, fmt.Errorf("parse snapshot for review: %w", err)
	}
	var maxScore float64
	found := false
	for _, question := range snapshot.Questions {
		if question.QuestionID == questionID && question.PaperGroup == paperGroup {
			maxScore = question.Score
			found = true
			break
		}
	}
	if !found {
		return ReviewSubmitResult{}, ErrNotFound
	}
	if score < 0 || score > maxScore {
		return ReviewSubmitResult{}, fmt.Errorf("score must be between 0 and %.2f: %w", maxScore, ErrInvalidState)
	}
	score = round2(score)

	if _, err := tx.Exec(ctx, `
		UPDATE review_tasks
		SET reviewer_id = $1, score = $2, comment = $3, status = 'submitted'
		WHERE id = $4`, reviewerID, score, comment, taskID); err != nil {
		return ReviewSubmitResult{}, fmt.Errorf("update review task: %w", err)
	}

	rules := parseReviewRules(rulesRaw)
	result := ReviewSubmitResult{TaskID: taskID, Round: round, Score: score}

	switch {
	case round == 1 && rules.Mode == "double":
		nextID, err := s.createReviewRound(ctx, tx, examID, attemptID, questionID, 2, []string{reviewerID})
		if err != nil {
			return ReviewSubmitResult{}, err
		}
		result.NextTaskID = nextID
	case round == 2:
		var first float64
		if err := tx.QueryRow(ctx, `
			SELECT score::float8 FROM review_tasks
			WHERE attempt_id = $1::uuid AND question_id = $2::uuid AND round = 1 AND status = 'submitted'`,
			attemptID, questionID).Scan(&first); err != nil {
			return ReviewSubmitResult{}, fmt.Errorf("load first review score: %w", err)
		}
		gap := rules.thresholdFor(maxScore)
		if math.Abs(first-score) <= gap {
			final := round2((first + score) / 2)
			result.FinalScore = &final
			result.Finalized = true
		} else {
			// Arbitration must not land on either of the two judges it is arbitrating.
			excluded, err := priorReviewers(ctx, tx, attemptID, questionID)
			if err != nil {
				return ReviewSubmitResult{}, err
			}
			nextID, err := s.createReviewRound(ctx, tx, examID, attemptID, questionID, 3, excluded)
			if err != nil {
				return ReviewSubmitResult{}, err
			}
			result.Arbitration = true
			result.NextTaskID = nextID
		}
	default:
		result.FinalScore = &score
		result.Finalized = true
	}

	total := 0.0
	if result.Finalized {
		total, err = applyReviewScore(ctx, tx, attemptID, questionID, *result.FinalScore)
		if err != nil {
			return ReviewSubmitResult{}, err
		}
		result.AttemptTotal = total
	} else {
		if err := tx.QueryRow(ctx, `SELECT score::float8 FROM attempts WHERE id = $1::uuid`, attemptID).Scan(&total); err != nil {
			return ReviewSubmitResult{}, fmt.Errorf("load attempt score: %w", err)
		}
		result.AttemptTotal = total
	}

	var pending int
	if err := tx.QueryRow(ctx, `
		SELECT count(*) FROM review_tasks
		WHERE attempt_id = $1 AND status IN ('pending', 'in_progress')`, attemptID).Scan(&pending); err != nil {
		return ReviewSubmitResult{}, fmt.Errorf("count pending review tasks: %w", err)
	}
	result.PendingReview = pending
	if pending == 0 {
		if _, err := tx.Exec(ctx, `UPDATE attempts SET status = 'graded' WHERE id = $1 AND status = 'submitted'`, attemptID); err != nil {
			return ReviewSubmitResult{}, fmt.Errorf("mark attempt graded: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return ReviewSubmitResult{}, fmt.Errorf("commit submit review: %w", err)
	}
	return result, nil
}

// priorReviewers lists everyone who already judged this question, so a new round is
// assigned to somebody who has not scored it before.
func priorReviewers(ctx context.Context, db DBTX, attemptID, questionID string) ([]string, error) {
	rows, err := db.Query(ctx, `
		SELECT DISTINCT reviewer_id::text FROM review_tasks
		WHERE attempt_id = $1::uuid AND question_id = $2::uuid AND reviewer_id IS NOT NULL`,
		attemptID, questionID)
	if err != nil {
		return nil, fmt.Errorf("list prior reviewers: %w", err)
	}
	defer rows.Close()
	reviewers := make([]string, 0, 2)
	for rows.Next() {
		var reviewerID string
		if err := rows.Scan(&reviewerID); err != nil {
			return nil, fmt.Errorf("scan prior reviewer: %w", err)
		}
		reviewers = append(reviewers, reviewerID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate prior reviewers: %w", err)
	}
	return reviewers, nil
}

// createReviewRound opens the next review round and auto-assigns the least loaded
// configured reviewer who has not scored an earlier round of this question.
func (s *Store) createReviewRound(ctx context.Context, tx pgx.Tx, examID, attemptID, questionID string, round int, exclude []string) (string, error) {
	reviewerID, _ := pickReviewer(ctx, tx, examID, exclude)
	var taskID string
	err := tx.QueryRow(ctx, `
		INSERT INTO review_tasks (attempt_id, question_id, round, reviewer_id, status)
		VALUES ($1::uuid, $2::uuid, $3, NULLIF($4, '')::uuid, 'pending')
		ON CONFLICT (attempt_id, question_id, round) DO NOTHING
		RETURNING id::text`, attemptID, questionID, round, reviewerID).Scan(&taskID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", nil
		}
		return "", fmt.Errorf("create review round %d: %w", round, err)
	}
	return taskID, nil
}

// applyReviewScore writes a finalized question score into the pending score record
// and refreshes the attempt total.
func applyReviewScore(ctx context.Context, tx pgx.Tx, attemptID, questionID string, finalScore float64) (float64, error) {
	var (
		recordID   string
		detailRaw  []byte
		recordStat string
	)
	err := tx.QueryRow(ctx, `
		SELECT id::text, detail, status FROM score_records
		WHERE attempt_id = $1 ORDER BY created_at DESC LIMIT 1
		FOR UPDATE`, attemptID).Scan(&recordID, &detailRaw, &recordStat)
	if err != nil {
		return 0, fmt.Errorf("load score record for review: %w", err)
	}
	if recordStat == "published" {
		return 0, ErrInvalidState
	}
	var detail ScoreDetail
	if err := json.Unmarshal(detailRaw, &detail); err != nil {
		return 0, fmt.Errorf("parse score detail for review: %w", err)
	}
	updated := false
	total := 0.0
	for index := range detail.Questions {
		item := &detail.Questions[index]
		if item.QuestionID == questionID {
			item.Score = finalScore
			item.NeedsReview = false
			item.Auto = false
			updated = true
		}
		total += item.Score
	}
	if !updated {
		return 0, ErrNotFound
	}
	total = round2(total)
	raw, err := json.Marshal(detail)
	if err != nil {
		return 0, fmt.Errorf("marshal reviewed score detail: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE score_records SET total = $1, detail = $2::jsonb WHERE id = $3`,
		total, string(raw), recordID); err != nil {
		return 0, fmt.Errorf("update score record: %w", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE attempts SET score = $1 WHERE id = $2`, total, attemptID); err != nil {
		return 0, fmt.Errorf("update attempt score: %w", err)
	}
	return total, nil
}
