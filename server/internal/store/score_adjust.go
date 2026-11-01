package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// ScoreOverride is one per-question score set by an administrator.
type ScoreOverride struct {
	QuestionID string  `json:"question_id"`
	Score      float64 `json:"score"`
}

type AdjustmentItem struct {
	QuestionID string  `json:"question_id"`
	Before     float64 `json:"before"`
	After      float64 `json:"after"`
	MaxScore   float64 `json:"max_score"`
}

type ScoreAdjustment struct {
	ID           string           `json:"id"`
	AttemptID    string           `json:"attempt_id"`
	BeforeTotal  float64          `json:"before_total"`
	AfterTotal   float64          `json:"after_total"`
	Reason       string           `json:"reason"`
	Items        []AdjustmentItem `json:"items"`
	OperatorID   string           `json:"operator_id"`
	OperatorName string           `json:"operator_name"`
	CreatedAt    time.Time        `json:"created_at"`
}

const appealColumns = `
		sa.id::text, sa.attempt_id::text, e.id::text, e.title, COALESCE(sa.question_id::text, ''),
		sr.total::float8, sa.reason, sa.status, sa.handle_note, sa.handled_at, sa.created_at,
		u.name, COALESCE(h.name, ''), sa.user_id::text`

const appealFrom = `
		FROM score_appeals sa
		JOIN attempts a ON a.id = sa.attempt_id
		JOIN exams e ON e.id = a.exam_id
		JOIN users u ON u.id = sa.user_id
		LEFT JOIN users h ON h.id = sa.handler_id
		JOIN LATERAL (
			SELECT total FROM score_records WHERE attempt_id = a.id ORDER BY created_at DESC LIMIT 1
		) sr ON true`

// AdjustScore writes a new score record for an attempt, keeps a traceable adjustment row, and
// preserves the publication state so a corrected score stays visible to the candidate.
func (s *Store) AdjustScore(ctx context.Context, scope Scope, attemptID, reason string, overrides []ScoreOverride) (ScoreAdjustment, error) {
	if len(overrides) == 0 {
		return ScoreAdjustment{}, fmt.Errorf("%w: 至少需要一道题目的新分数", ErrInvalidState)
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ScoreAdjustment{}, fmt.Errorf("begin score adjust: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var (
		recordID    string
		before      float64
		status      string
		attemptStat string
		orgID       string
		userID      string
		publishedAt *time.Time
		detailRaw   []byte
	)
	scopeSQL, scopeArgs := scope.peopleFilter("u", 3)
	args := append([]any{attemptID, scope.OrgID}, scopeArgs...)
	err = tx.QueryRow(ctx, `
		SELECT sr.id::text, sr.total::float8, sr.status, sr.published_at, sr.detail, a.status, a.user_id::text, e.org_id::text
		FROM score_records sr
		JOIN attempts a ON a.id = sr.attempt_id
		JOIN exams e ON e.id = a.exam_id
		JOIN users u ON u.id = a.user_id
		WHERE sr.attempt_id = $1::uuid AND e.org_id = $2`+scopeSQL+`
		ORDER BY sr.created_at DESC
		LIMIT 1
		FOR UPDATE OF sr`, args...).
		Scan(&recordID, &before, &status, &publishedAt, &detailRaw, &attemptStat, &userID, &orgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ScoreAdjustment{}, ErrNotFound
		}
		return ScoreAdjustment{}, fmt.Errorf("lock score record: %w", err)
	}
	if attemptStat != "graded" && attemptStat != "published" && attemptStat != "submitted" {
		return ScoreAdjustment{}, fmt.Errorf("%w: 答卷还未交卷，无法更正", ErrInvalidState)
	}

	var detail ScoreDetail
	if len(detailRaw) > 0 {
		if err := json.Unmarshal(detailRaw, &detail); err != nil {
			return ScoreAdjustment{}, fmt.Errorf("parse score detail: %w", err)
		}
	}
	positions := make(map[string]int, len(detail.Questions))
	for index, item := range detail.Questions {
		positions[item.QuestionID] = index
	}

	items := make([]AdjustmentItem, 0, len(overrides))
	for _, override := range overrides {
		questionID := strings.TrimSpace(override.QuestionID)
		position, ok := positions[questionID]
		if !ok {
			return ScoreAdjustment{}, fmt.Errorf("%w: 题目 %s 不属于这份答卷", ErrInvalidState, shortID(questionID))
		}
		current := detail.Questions[position]
		if override.Score < 0 || override.Score > current.MaxScore {
			return ScoreAdjustment{}, fmt.Errorf("%w: 「%s」得分必须在 0~%.1f 之间", ErrInvalidState, shortID(questionID), current.MaxScore)
		}
		if override.Score == current.Score {
			continue
		}
		items = append(items, AdjustmentItem{
			QuestionID: questionID, Before: current.Score, After: round2(override.Score), MaxScore: current.MaxScore,
		})
		detail.Questions[position].Score = round2(override.Score)
		detail.Questions[position].Auto = false
		detail.Questions[position].NeedsReview = false
	}
	if len(items) == 0 {
		return ScoreAdjustment{}, fmt.Errorf("%w: 分数没有变化", ErrInvalidState)
	}

	total := 0.0
	for _, item := range detail.Questions {
		total += item.Score
	}
	total = round2(total)

	newDetail, err := json.Marshal(detail)
	if err != nil {
		return ScoreAdjustment{}, fmt.Errorf("marshal adjusted detail: %w", err)
	}

	nextStatus := status
	nextPublishedAt := publishedAt
	if status == "published" {
		now := time.Now()
		nextPublishedAt = &now
	}
	var newRecordID string
	err = tx.QueryRow(ctx, `
		INSERT INTO score_records (attempt_id, total, detail, status, published_at)
		VALUES ($1::uuid, $2, $3::jsonb, $4, $5)
		RETURNING id::text`, attemptID, total, string(newDetail), nextStatus, nextPublishedAt).
		Scan(&newRecordID)
	if err != nil {
		return ScoreAdjustment{}, fmt.Errorf("insert adjusted score record: %w", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE attempts SET score = $1 WHERE id = $2::uuid AND status <> 'voided'`, total, attemptID); err != nil {
		return ScoreAdjustment{}, fmt.Errorf("update attempt score: %w", err)
	}

	itemsRaw, err := json.Marshal(items)
	if err != nil {
		return ScoreAdjustment{}, fmt.Errorf("marshal adjustment items: %w", err)
	}
	var operatorName string
	err = tx.QueryRow(ctx, `SELECT name FROM users WHERE id = $1::uuid`, scope.UserID).Scan(&operatorName)
	if err != nil {
		return ScoreAdjustment{}, fmt.Errorf("load operator: %w", err)
	}
	adjustment := ScoreAdjustment{
		ID: recordID, AttemptID: attemptID, BeforeTotal: before, AfterTotal: total,
		Reason: reason, Items: items, OperatorID: scope.UserID, OperatorName: operatorName,
	}
	err = tx.QueryRow(ctx, `
		INSERT INTO score_adjustments (org_id, attempt_id, before_total, after_total, reason, items, operator_id)
		VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb, NULLIF($7, '')::uuid)
		RETURNING id::text, created_at`,
		orgID, attemptID, before, total, reason, string(itemsRaw), scope.UserID).
		Scan(&adjustment.ID, &adjustment.CreatedAt)
	if err != nil {
		return ScoreAdjustment{}, fmt.Errorf("insert score adjustment: %w", err)
	}

	if nextStatus == "published" {
		content := fmt.Sprintf("成绩已更正：当前 %.2f 分（原 %.2f 分）。如有疑问可在“我的成绩”提交申诉。", total, before)
		if _, err := s.notifyUser(ctx, tx, orgID, userID, "成绩更正", content, "score_adjust", newRecordID, map[string]string{
			"total": fmt.Sprintf("%.2f", total), "before": fmt.Sprintf("%.2f", before),
		}); err != nil {
			return ScoreAdjustment{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return ScoreAdjustment{}, fmt.Errorf("commit score adjust: %w", err)
	}
	return adjustment, nil
}

// ListScoreAdjustments returns the correction history of one attempt inside the caller's scope.
func (s *Store) ListScoreAdjustments(ctx context.Context, scope Scope, attemptID string) ([]ScoreAdjustment, error) {
	scopeSQL, scopeArgs := scope.peopleFilter("u", 3)
	args := append([]any{attemptID, scope.OrgID}, scopeArgs...)
	rows, err := s.pool.Query(ctx, `
		SELECT sa.id::text, sa.attempt_id::text, sa.before_total::float8, sa.after_total::float8, sa.reason,
			sa.items, COALESCE(sa.operator_id::text, ''), COALESCE(u.name, '系统'), sa.created_at
		FROM score_adjustments sa
		JOIN attempts a ON a.id = sa.attempt_id
		JOIN exams e ON e.id = a.exam_id
		JOIN users u2 ON u2.id = a.user_id
		LEFT JOIN users u ON u.id = sa.operator_id
		WHERE sa.attempt_id = $1::uuid AND e.org_id = $2`+scopeSQL+`
		ORDER BY sa.created_at DESC`, args...)
	if err != nil {
		return nil, fmt.Errorf("list score adjustments: %w", err)
	}
	defer rows.Close()

	items := make([]ScoreAdjustment, 0)
	for rows.Next() {
		var (
			item     ScoreAdjustment
			itemsRaw []byte
		)
		if err := rows.Scan(&item.ID, &item.AttemptID, &item.BeforeTotal, &item.AfterTotal, &item.Reason,
			&itemsRaw, &item.OperatorID, &item.OperatorName, &item.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan score adjustment: %w", err)
		}
		_ = json.Unmarshal(itemsRaw, &item.Items)
		if item.Items == nil {
			item.Items = []AdjustmentItem{}
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate score adjustments: %w", err)
	}
	return items, nil
}

type ScoreAppeal struct {
	ID          string     `json:"id"`
	AttemptID   string     `json:"attempt_id"`
	ExamID      string     `json:"exam_id"`
	ExamTitle   string     `json:"exam_title"`
	QuestionID  string     `json:"question_id"`
	UserID      string     `json:"user_id"`
	UserName    string     `json:"user_name"`
	Total       float64    `json:"total"`
	Reason      string     `json:"reason"`
	Status      string     `json:"status"`
	HandleNote  string     `json:"handle_note"`
	HandlerName string     `json:"handler_name"`
	HandledAt   *time.Time `json:"handled_at"`
	CreatedAt   time.Time  `json:"created_at"`
}

// CreateAppeal files a candidate objection against their own published score.
func (s *Store) CreateAppeal(ctx context.Context, scope Scope, attemptID string, questionID string, reason string) (ScoreAppeal, error) {
	var (
		item        ScoreAppeal
		orgID       string
		userID      string
		status      string
		publishedAt *time.Time
	)
	err := s.pool.QueryRow(ctx, `
		SELECT a.id::text, e.id::text, e.title, a.user_id::text, u.name, sr.total::float8, sr.status, sr.published_at, e.org_id::text
		FROM attempts a
		JOIN exams e ON e.id = a.exam_id
		JOIN users u ON u.id = a.user_id
		JOIN LATERAL (
			SELECT total, status, published_at FROM score_records WHERE attempt_id = a.id ORDER BY created_at DESC LIMIT 1
		) sr ON true
		WHERE a.id = $1::uuid AND a.user_id = $2::uuid`, attemptID, scope.UserID).
		Scan(&item.AttemptID, &item.ExamID, &item.ExamTitle, &userID, &item.UserName, &item.Total, &status, &publishedAt, &orgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ScoreAppeal{}, ErrNotFound
		}
		return ScoreAppeal{}, fmt.Errorf("load attempt for appeal: %w", err)
	}
	if status != "published" || publishedAt == nil {
		return ScoreAppeal{}, fmt.Errorf("%w: 成绩尚未发布，暂不能申诉", ErrInvalidState)
	}
	if questionID != "" {
		var belongs bool
		if err := s.pool.QueryRow(ctx, `
			SELECT EXISTS(SELECT 1 FROM score_records sr
				WHERE sr.attempt_id = $1::uuid AND sr.detail @> $2::jsonb)`,
			attemptID, fmt.Sprintf(`{"questions":[{"question_id":"%s"}]}`, questionID)).Scan(&belongs); err != nil {
			return ScoreAppeal{}, fmt.Errorf("check appeal question: %w", err)
		}
		if !belongs {
			return ScoreAppeal{}, fmt.Errorf("%w: 题目不属于这份答卷", ErrInvalidState)
		}
	}

	item.QuestionID = questionID
	err = s.pool.QueryRow(ctx, `
		INSERT INTO score_appeals (org_id, attempt_id, user_id, question_id, reason)
		VALUES ($1::uuid, $2::uuid, $3::uuid, NULLIF($4, '')::uuid, $5)
		RETURNING id::text, status, created_at`,
		orgID, attemptID, userID, questionID, reason).
		Scan(&item.ID, &item.Status, &item.CreatedAt)
	if err != nil {
		if isUniqueViolation(err) {
			return ScoreAppeal{}, fmt.Errorf("%w: 这道题已有待处理的申诉", ErrConflict)
		}
		return ScoreAppeal{}, fmt.Errorf("create appeal: %w", mapUniqueViolation(err))
	}
	item.UserID = userID
	return item, nil
}

// ListMyAppeals returns the candidate's own appeal history.
func (s *Store) ListMyAppeals(ctx context.Context, userID string) ([]ScoreAppeal, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+appealColumns+appealFrom+`
		WHERE sa.user_id = $1::uuid
		ORDER BY sa.created_at DESC`, userID)
	if err != nil {
		return nil, fmt.Errorf("list my appeals: %w", err)
	}
	return scanAppeals(rows)
}

// ListAppeals lists objections visible to the caller for administrators.
func (s *Store) ListAppeals(ctx context.Context, scope Scope, status string, page, pageSize int) ([]ScoreAppeal, int64, error) {
	scopeSQL, scopeArgs := scope.peopleFilter("u", 2)
	where := []string{"e.org_id = $1" + scopeSQL}
	args := append([]any{scope.OrgID}, scopeArgs...)
	if status != "" {
		args = append(args, status)
		where = append(where, fmt.Sprintf("sa.status = $%d", len(args)))
	}
	whereSQL := strings.Join(where, " AND ")

	var total int64
	if err := s.pool.QueryRow(ctx, `SELECT count(*) `+appealFrom+`
		WHERE `+whereSQL, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count appeals: %w", err)
	}
	args = append(args, pageSize, (page-1)*pageSize)
	rows, err := s.pool.Query(ctx, `SELECT `+appealColumns+appealFrom+`
		WHERE `+whereSQL+`
		ORDER BY sa.created_at DESC
		LIMIT $`+fmt.Sprint(len(args)-1)+` OFFSET $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list appeals: %w", err)
	}
	items, err := scanAppeals(rows)
	if err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

// HandleAppeal accepts or rejects one objection and notifies the candidate.
func (s *Store) HandleAppeal(ctx context.Context, scope Scope, appealID, action, note string) (ScoreAppeal, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ScoreAppeal{}, fmt.Errorf("begin handle appeal: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var (
		item     ScoreAppeal
		orgID    string
		userID   string
		current  string
		question *string
		handler  *string
	)
	err = tx.QueryRow(ctx, `
		SELECT sa.attempt_id::text, e.id::text, e.title, sa.question_id::text, sa.user_id::text,
			sa.reason, sa.status, e.org_id::text, u.name, COALESCE(h.name, '')
		FROM score_appeals sa
		JOIN attempts a ON a.id = sa.attempt_id
		JOIN exams e ON e.id = a.exam_id
		JOIN users u ON u.id = sa.user_id
		LEFT JOIN users h ON h.id = sa.handler_id
		WHERE sa.id = $1::uuid AND e.org_id = $2
		FOR UPDATE OF sa`, appealID, scope.OrgID).
		Scan(&item.AttemptID, &item.ExamID, &item.ExamTitle, &question, &userID,
			&item.Reason, &current, &orgID, &item.UserName, &handler)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ScoreAppeal{}, ErrNotFound
		}
		return ScoreAppeal{}, fmt.Errorf("lock appeal: %w", err)
	}
	if current != "pending" {
		return ScoreAppeal{}, fmt.Errorf("%w: 该申诉已处理", ErrInvalidState)
	}
	if question != nil {
		item.QuestionID = *question
	}
	if handler != nil {
		item.HandlerName = *handler
	}

	var total float64
	if err := tx.QueryRow(ctx, `
		SELECT total::float8 FROM score_records WHERE attempt_id = $1::uuid ORDER BY created_at DESC LIMIT 1`, item.AttemptID).
		Scan(&total); err != nil {
		return ScoreAppeal{}, fmt.Errorf("load appeal total: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE score_appeals
		SET status = $2, handle_note = $3, handler_id = NULLIF($4, '')::uuid, handled_at = now(), updated_at = now()
		WHERE id = $1::uuid`, appealID, action, note, scope.UserID); err != nil {
		return ScoreAppeal{}, fmt.Errorf("update appeal: %w", err)
	}

	verdict := "未通过"
	if action == "accepted" {
		verdict = "已通过"
	}
	content := fmt.Sprintf("成绩申诉%s：%s。当前得分 %.2f 分。", verdict, note, total)
	if _, err := s.notifyUser(ctx, tx, orgID, userID, "成绩申诉结果", content, "score_appeal", appealID, map[string]string{
		"verdict": verdict, "note": note, "total": fmt.Sprintf("%.2f", total),
	}); err != nil {
		return ScoreAppeal{}, err
	}
	var operatorName string
	if err := tx.QueryRow(ctx, `SELECT name FROM users WHERE id = $1::uuid`, scope.UserID).Scan(&operatorName); err != nil {
		return ScoreAppeal{}, fmt.Errorf("load appeal handler: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return ScoreAppeal{}, fmt.Errorf("commit handle appeal: %w", err)
	}

	item.ID = appealID
	item.UserID = userID
	item.Total = total
	item.Status = action
	item.HandleNote = note
	item.HandlerName = operatorName
	now := time.Now()
	item.HandledAt = &now
	return item, nil
}

func shortID(value string) string {
	if len(value) <= 8 {
		return value
	}
	return value[:8]
}

func isUniqueViolation(err error) bool {
	var pgErr interface{ SQLState() string }
	if errors.As(err, &pgErr) {
		return pgErr.SQLState() == "23505"
	}
	return false
}

func scanAppeals(rows pgx.Rows) ([]ScoreAppeal, error) {
	defer rows.Close()
	items := make([]ScoreAppeal, 0)
	for rows.Next() {
		var (
			item       ScoreAppeal
			questionID string
		)
		if err := rows.Scan(&item.ID, &item.AttemptID, &item.ExamID, &item.ExamTitle, &questionID,
			&item.Total, &item.Reason, &item.Status, &item.HandleNote, &item.HandledAt, &item.CreatedAt,
			&item.UserName, &item.HandlerName, &item.UserID); err != nil {
			return nil, fmt.Errorf("scan appeal: %w", err)
		}
		item.QuestionID = questionID
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate appeals: %w", err)
	}
	return items, nil
}
