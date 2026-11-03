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

type QuestionBank struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	Scope         string    `json:"scope"`
	Status        string    `json:"status"`
	QuestionCount int64     `json:"question_count"`
	CreatedAt     time.Time `json:"created_at"`
}

type Question struct {
	ID             string          `json:"id"`
	BankID         string          `json:"bank_id"`
	Type           string          `json:"type"`
	KnowledgePoint string          `json:"knowledge_point"`
	Difficulty     string          `json:"difficulty"`
	Content        json.RawMessage `json:"content"`
	Answer         json.RawMessage `json:"answer"`
	ScoreRule      json.RawMessage `json:"score_rule"`
	DefaultScore   float64         `json:"default_score"`
	Status         string          `json:"status"`
	Version        int             `json:"version"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

const questionColumns = `id::text, bank_id::text, type, knowledge_point, difficulty, content, answer,
	score_rule, default_score::float8, status, version, created_at, updated_at`

func questionScanDest(q *Question) []any {
	return []any{
		&q.ID, &q.BankID, &q.Type, &q.KnowledgePoint, &q.Difficulty, &q.Content, &q.Answer,
		&q.ScoreRule, &q.DefaultScore, &q.Status, &q.Version, &q.CreatedAt, &q.UpdatedAt,
	}
}

func (s *Store) ListQuestionBanks(ctx context.Context, scope Scope) ([]QuestionBank, error) {
	visSQL, visArgs := scope.bankVisibility("b", 2)
	rows, err := s.pool.Query(ctx, `
		SELECT b.id::text, b.name, b.scope, b.status, count(q.id), b.created_at
		FROM question_banks b
		LEFT JOIN questions q ON q.bank_id = b.id
		WHERE b.org_id = $1`+visSQL+`
		GROUP BY b.id
		ORDER BY b.created_at DESC`, append([]any{scope.OrgID}, visArgs...)...)
	if err != nil {
		return nil, fmt.Errorf("list question banks: %w", err)
	}
	defer rows.Close()

	banks := make([]QuestionBank, 0)
	for rows.Next() {
		var b QuestionBank
		if err := rows.Scan(&b.ID, &b.Name, &b.Scope, &b.Status, &b.QuestionCount, &b.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan question bank: %w", err)
		}
		banks = append(banks, b)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate question banks: %w", err)
	}
	return banks, nil
}

func (s *Store) CreateQuestionBank(ctx context.Context, orgID, ownerID, name, scope string) (QuestionBank, error) {
	if scope == "" {
		scope = "org"
	}
	var b QuestionBank
	err := s.pool.QueryRow(ctx, `
		INSERT INTO question_banks (org_id, name, scope, owner_id)
		VALUES ($1, $2, $3, NULLIF($4, '')::uuid)
		RETURNING id::text, name, scope, status, 0, created_at`,
		orgID, name, scope, ownerID,
	).Scan(&b.ID, &b.Name, &b.Scope, &b.Status, &b.QuestionCount, &b.CreatedAt)
	if err != nil {
		return QuestionBank{}, fmt.Errorf("create question bank: %w", mapUniqueViolation(err))
	}
	return b, nil
}

type QuestionFilter struct {
	BankID     string
	Type       string
	Difficulty string
	Status     string
	Keyword    string
	Page       int
	PageSize   int
}

func (s *Store) ListQuestions(ctx context.Context, scope Scope, f QuestionFilter) ([]Question, int64, error) {
	visSQL, visArgs := scope.bankVisibility("b", 2)
	bankSQL := " AND EXISTS (SELECT 1 FROM question_banks b WHERE b.id = questions.bank_id" + visSQL + ")"
	where := []string{"org_id = $1" + bankSQL}
	args := append([]any{scope.OrgID}, visArgs...)

	if f.BankID != "" {
		args = append(args, f.BankID)
		where = append(where, fmt.Sprintf("bank_id = $%d::uuid", len(args)))
	}
	if f.Type != "" {
		args = append(args, f.Type)
		where = append(where, fmt.Sprintf("type = $%d", len(args)))
	}
	if f.Difficulty != "" {
		args = append(args, f.Difficulty)
		where = append(where, fmt.Sprintf("difficulty = $%d", len(args)))
	}
	if f.Status != "" {
		args = append(args, f.Status)
		where = append(where, fmt.Sprintf("status = $%d", len(args)))
	}
	if f.Keyword != "" {
		args = append(args, "%"+f.Keyword+"%")
		n := len(args)
		where = append(where, fmt.Sprintf("(content->>'stem' ILIKE $%d OR knowledge_point ILIKE $%d)", n, n))
	}
	whereSQL := strings.Join(where, " AND ")

	var total int64
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM questions WHERE `+whereSQL, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count questions: %w", err)
	}

	args = append(args, f.PageSize, (f.Page-1)*f.PageSize)
	rows, err := s.pool.Query(ctx, `
		SELECT `+questionColumns+`
		FROM questions
		WHERE `+whereSQL+`
		ORDER BY updated_at DESC
		LIMIT $`+fmt.Sprint(len(args)-1)+` OFFSET $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list questions: %w", err)
	}
	defer rows.Close()

	questions := make([]Question, 0, f.PageSize)
	for rows.Next() {
		var q Question
		if err := rows.Scan(questionScanDest(&q)...); err != nil {
			return nil, 0, fmt.Errorf("scan question: %w", err)
		}
		questions = append(questions, q)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("iterate questions: %w", err)
	}
	return questions, total, nil
}

// GetQuestion applies the same bank visibility as the list query. Without it any teacher
// in the organization could read another teacher's personal question — including the
// standard answer — simply by knowing its UUID.
func (s *Store) GetQuestion(ctx context.Context, scope Scope, id string) (Question, error) {
	visSQL, visArgs := scope.bankVisibility("b", 3)
	var q Question
	err := s.pool.QueryRow(ctx, `
		SELECT `+questionColumns+`
		FROM questions
		WHERE id = $1 AND org_id = $2
			AND EXISTS (SELECT 1 FROM question_banks b WHERE b.id = questions.bank_id`+visSQL+`)`,
		append([]any{id, scope.OrgID}, visArgs...)...).
		Scan(questionScanDest(&q)...)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Question{}, ErrNotFound
		}
		return Question{}, fmt.Errorf("get question: %w", err)
	}
	return q, nil
}

type CreateQuestionParams struct {
	OrgID          string
	BankID         string
	Type           string
	KnowledgePoint string
	Difficulty     string
	Content        json.RawMessage
	Answer         json.RawMessage
	ScoreRule      json.RawMessage
	DefaultScore   float64
	CreatedBy      string
}

func (s *Store) CreateQuestion(ctx context.Context, scope Scope, p CreateQuestionParams) (Question, error) {
	// The target bank must be visible to the caller too, otherwise a teacher could file
	// questions into another teacher's personal bank by guessing its ID.
	visSQL, visArgs := scope.bankVisibility("b", 3)
	var bankExists bool
	if err := s.pool.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM question_banks b
			WHERE b.id = $1 AND b.org_id = $2`+visSQL+`)`,
		append([]any{p.BankID, scope.OrgID}, visArgs...)...).Scan(&bankExists); err != nil {
		return Question{}, fmt.Errorf("validate question bank: %w", err)
	}
	if !bankExists {
		return Question{}, ErrNotFound
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Question{}, fmt.Errorf("begin create question: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var q Question
	err = tx.QueryRow(ctx, `
		INSERT INTO questions (org_id, bank_id, type, knowledge_point, difficulty, content, answer, score_rule, default_score, created_by)
		VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, NULLIF($10, '')::uuid)
		RETURNING `+questionColumns,
		p.OrgID, p.BankID, p.Type, p.KnowledgePoint, p.Difficulty,
		string(p.Content), string(p.Answer), string(p.ScoreRule), p.DefaultScore, p.CreatedBy,
	).Scan(questionScanDest(&q)...)
	if err != nil {
		return Question{}, fmt.Errorf("insert question: %w", mapUniqueViolation(err))
	}
	if err := insertQuestionRevision(ctx, tx, q, p.CreatedBy); err != nil {
		return Question{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Question{}, fmt.Errorf("commit create question: %w", err)
	}
	return q, nil
}

type UpdateQuestionParams struct {
	Type           *string
	KnowledgePoint *string
	Difficulty     *string
	Content        *json.RawMessage
	Answer         *json.RawMessage
	ScoreRule      *json.RawMessage
	DefaultScore   *float64
	ActorID        string
}

func (s *Store) UpdateQuestion(ctx context.Context, scope Scope, id string, p UpdateQuestionParams) (Question, error) {
	q, err := s.GetQuestion(ctx, scope, id)
	if err != nil {
		return Question{}, err
	}
	if p.Type != nil {
		q.Type = *p.Type
	}
	if p.KnowledgePoint != nil {
		q.KnowledgePoint = *p.KnowledgePoint
	}
	if p.Difficulty != nil {
		q.Difficulty = *p.Difficulty
	}
	if p.Content != nil {
		q.Content = *p.Content
	}
	if p.Answer != nil {
		q.Answer = *p.Answer
	}
	if p.ScoreRule != nil {
		q.ScoreRule = *p.ScoreRule
	}
	if p.DefaultScore != nil {
		q.DefaultScore = *p.DefaultScore
	}
	q.Version++

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Question{}, fmt.Errorf("begin update question: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	_, err = tx.Exec(ctx, `
		UPDATE questions
		SET type = $1, knowledge_point = $2, difficulty = $3, content = $4::jsonb, answer = $5::jsonb,
			score_rule = $6::jsonb, default_score = $7, version = $8
		WHERE id = $9 AND org_id = $10`,
		q.Type, q.KnowledgePoint, q.Difficulty, string(q.Content), string(q.Answer),
		string(q.ScoreRule), q.DefaultScore, q.Version, id, scope.OrgID,
	)
	if err != nil {
		return Question{}, fmt.Errorf("update question: %w", err)
	}
	if err := insertQuestionRevision(ctx, tx, q, p.ActorID); err != nil {
		return Question{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Question{}, fmt.Errorf("commit update question: %w", err)
	}
	return s.GetQuestion(ctx, scope, id)
}

func (s *Store) PublishQuestion(ctx context.Context, scope Scope, id, actorID string) (Question, error) {
	visSQL, visArgs := scope.bankVisibility("b", 3)
	tag, err := s.pool.Exec(ctx, `
		UPDATE questions SET status = 'published'
		WHERE id = $1 AND org_id = $2 AND status IN ('draft', 'pending_review')
			AND EXISTS (SELECT 1 FROM question_banks b WHERE b.id = questions.bank_id`+visSQL+`)`,
		append([]any{id, scope.OrgID}, visArgs...)...)
	if err != nil {
		return Question{}, fmt.Errorf("publish question: %w", err)
	}
	if tag.RowsAffected() == 0 {
		if _, err := s.GetQuestion(ctx, scope, id); err != nil {
			return Question{}, err
		}
		return Question{}, ErrInvalidState
	}
	return s.GetQuestion(ctx, scope, id)
}

// RejectQuestion 审核退回：pending_review 回到 draft，理由通过站内通知与审计传达给命题人。
func (s *Store) RejectQuestion(ctx context.Context, scope Scope, id, reason string) (Question, error) {
	visSQL, visArgs := scope.bankVisibility("b", 3)
	tag, err := s.pool.Exec(ctx, `
		UPDATE questions SET status = 'draft'
		WHERE id = $1 AND org_id = $2 AND status = 'pending_review'
			AND EXISTS (SELECT 1 FROM question_banks b WHERE b.id = questions.bank_id`+visSQL+`)`,
		append([]any{id, scope.OrgID}, visArgs...)...)
	if err != nil {
		return Question{}, fmt.Errorf("reject question: %w", err)
	}
	if tag.RowsAffected() == 0 {
		if _, err := s.GetQuestion(ctx, scope, id); err != nil {
			return Question{}, err
		}
		return Question{}, ErrInvalidState
	}
	return s.GetQuestion(ctx, scope, id)
}

// ArchiveQuestion 归档题目（软删）：仍在草稿/待审核/已通过试卷中的题目不允许归档，
// 已归档幂等返回。已发布且无在用引用的题目可归档下架。
func (s *Store) ArchiveQuestion(ctx context.Context, scope Scope, id string) (Question, error) {
	visSQL, visArgs := scope.bankVisibility("b", 3)
	tag, err := s.pool.Exec(ctx, `
		UPDATE questions SET status = 'archived'
		WHERE id = $1 AND org_id = $2 AND status <> 'archived'
			AND NOT EXISTS (
				SELECT 1 FROM paper_questions pq
				JOIN papers p ON p.id = pq.paper_id
				WHERE pq.question_id = questions.id AND p.status IN ('draft', 'pending_review', 'approved')
			)
			AND EXISTS (SELECT 1 FROM question_banks b WHERE b.id = questions.bank_id`+visSQL+`)`,
		append([]any{id, scope.OrgID}, visArgs...)...)
	if err != nil {
		return Question{}, fmt.Errorf("archive question: %w", err)
	}
	if tag.RowsAffected() == 0 {
		q, err := s.GetQuestion(ctx, scope, id)
		if err != nil {
			return Question{}, err
		}
		if q.Status == "archived" {
			return q, nil
		}
		return Question{}, fmt.Errorf("question is referenced by an active paper: %w", ErrInvalidState)
	}
	return s.GetQuestion(ctx, scope, id)
}

func insertQuestionRevision(ctx context.Context, db DBTX, q Question, actorID string) error {
	payload, err := json.Marshal(struct {
		Content      json.RawMessage `json:"content"`
		Answer       json.RawMessage `json:"answer"`
		ScoreRule    json.RawMessage `json:"score_rule"`
		DefaultScore float64         `json:"default_score"`
		Type         string          `json:"type"`
	}{
		Content: q.Content, Answer: q.Answer, ScoreRule: q.ScoreRule, DefaultScore: q.DefaultScore, Type: q.Type,
	})
	if err != nil {
		return fmt.Errorf("marshal question revision: %w", err)
	}
	if _, err := db.Exec(ctx, `
		INSERT INTO question_revisions (question_id, version, payload, created_by)
		VALUES ($1, $2, $3::jsonb, NULLIF($4, '')::uuid)`,
		q.ID, q.Version, string(payload), actorID,
	); err != nil {
		return fmt.Errorf("insert question revision: %w", err)
	}
	return nil
}

type QuestionDraw struct {
	BankID         string
	Type           string
	Difficulty     string
	KnowledgePoint string
	ExcludeIDs     []string
	Limit          int
}

func drawPublishedQuestions(ctx context.Context, db DBTX, orgID string, d QuestionDraw) ([]Question, error) {
	where := []string{"org_id = $1", "status = 'published'"}
	args := []any{orgID}
	if d.BankID != "" {
		args = append(args, d.BankID)
		where = append(where, fmt.Sprintf("bank_id = $%d::uuid", len(args)))
	}
	if d.Type != "" {
		args = append(args, d.Type)
		where = append(where, fmt.Sprintf("type = $%d", len(args)))
	}
	if d.Difficulty != "" {
		args = append(args, d.Difficulty)
		where = append(where, fmt.Sprintf("difficulty = $%d", len(args)))
	}
	if d.KnowledgePoint != "" {
		args = append(args, d.KnowledgePoint)
		where = append(where, fmt.Sprintf("knowledge_point = $%d", len(args)))
	}
	if len(d.ExcludeIDs) > 0 {
		args = append(args, d.ExcludeIDs)
		where = append(where, fmt.Sprintf("id::text <> ALL($%d::text[])", len(args)))
	}
	args = append(args, d.Limit)
	query := `SELECT ` + questionColumns + ` FROM questions WHERE ` + strings.Join(where, " AND ") +
		` ORDER BY random() LIMIT $` + fmt.Sprint(len(args))

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("draw questions: %w", err)
	}
	defer rows.Close()

	questions := make([]Question, 0, d.Limit)
	for rows.Next() {
		var q Question
		if err := rows.Scan(questionScanDest(&q)...); err != nil {
			return nil, fmt.Errorf("scan drawn question: %w", err)
		}
		questions = append(questions, q)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate drawn questions: %w", err)
	}
	return questions, nil
}
