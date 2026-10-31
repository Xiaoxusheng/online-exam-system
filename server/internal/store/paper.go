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

type Paper struct {
	ID            string          `json:"id"`
	Type          string          `json:"type"`
	Title         string          `json:"title"`
	Status        string          `json:"status"`
	TotalScore    float64         `json:"total_score"`
	Version       int             `json:"version"`
	Rules         json.RawMessage `json:"rules"`
	QuestionCount int64           `json:"question_count"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
}

type PaperQuestion struct {
	QuestionID     string          `json:"question_id"`
	Section        string          `json:"section"`
	PaperGroup     string          `json:"paper_group"`
	Score          float64         `json:"score"`
	Type           string          `json:"type"`
	Difficulty     string          `json:"difficulty"`
	KnowledgePoint string          `json:"knowledge_point"`
	Content        json.RawMessage `json:"content"`
}

type PaperDetail struct {
	Paper
	Questions []PaperQuestion `json:"questions"`
}

type PaperQuestionInput struct {
	QuestionID string  `json:"question_id"`
	Section    string  `json:"section"`
	PaperGroup string  `json:"paper_group"`
	Score      float64 `json:"score"`
}

type PaperFilter struct {
	Status   string
	Type     string
	Keyword  string
	Page     int
	PageSize int
}

const paperColumns = `p.id::text, p.type, p.title, p.status, p.total_score::float8, p.version, p.rules,
	(SELECT count(*) FROM paper_questions pq WHERE pq.paper_id = p.id), p.created_at, p.updated_at`

func paperScanDest(p *Paper) []any {
	return []any{
		&p.ID, &p.Type, &p.Title, &p.Status, &p.TotalScore, &p.Version, &p.Rules,
		&p.QuestionCount, &p.CreatedAt, &p.UpdatedAt,
	}
}

func (s *Store) ListPapers(ctx context.Context, orgID string, f PaperFilter) ([]Paper, int64, error) {
	where := []string{"p.org_id = $1"}
	args := []any{orgID}
	if f.Status != "" {
		args = append(args, f.Status)
		where = append(where, fmt.Sprintf("p.status = $%d", len(args)))
	}
	if f.Type != "" {
		args = append(args, f.Type)
		where = append(where, fmt.Sprintf("p.type = $%d", len(args)))
	}
	if f.Keyword != "" {
		args = append(args, "%"+f.Keyword+"%")
		where = append(where, fmt.Sprintf("p.title ILIKE $%d", len(args)))
	}
	whereSQL := strings.Join(where, " AND ")

	var total int64
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM papers p WHERE `+whereSQL, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count papers: %w", err)
	}

	args = append(args, f.PageSize, (f.Page-1)*f.PageSize)
	rows, err := s.pool.Query(ctx, `
		SELECT `+paperColumns+`
		FROM papers p
		WHERE `+whereSQL+`
		ORDER BY p.updated_at DESC
		LIMIT $`+fmt.Sprint(len(args)-1)+` OFFSET $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list papers: %w", err)
	}
	defer rows.Close()

	papers := make([]Paper, 0, f.PageSize)
	for rows.Next() {
		var p Paper
		if err := rows.Scan(paperScanDest(&p)...); err != nil {
			return nil, 0, fmt.Errorf("scan paper: %w", err)
		}
		papers = append(papers, p)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("iterate papers: %w", err)
	}
	return papers, total, nil
}

func (s *Store) GetPaper(ctx context.Context, orgID, paperID string) (PaperDetail, error) {
	var p Paper
	err := s.pool.QueryRow(ctx, `SELECT `+paperColumns+` FROM papers p WHERE p.id = $1 AND p.org_id = $2`, paperID, orgID).
		Scan(paperScanDest(&p)...)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return PaperDetail{}, ErrNotFound
		}
		return PaperDetail{}, fmt.Errorf("get paper: %w", err)
	}

	rows, err := s.pool.Query(ctx, `
		SELECT pq.question_id::text, pq.section, pq.paper_group, pq.score::float8,
			q.type, q.difficulty, q.knowledge_point, q.content
		FROM paper_questions pq
		JOIN questions q ON q.id = pq.question_id
		WHERE pq.paper_id = $1
		ORDER BY pq.paper_group, pq.sort_order`, paperID)
	if err != nil {
		return PaperDetail{}, fmt.Errorf("list paper questions: %w", err)
	}
	defer rows.Close()

	questions := make([]PaperQuestion, 0)
	for rows.Next() {
		var q PaperQuestion
		if err := rows.Scan(&q.QuestionID, &q.Section, &q.PaperGroup, &q.Score, &q.Type, &q.Difficulty, &q.KnowledgePoint, &q.Content); err != nil {
			return PaperDetail{}, fmt.Errorf("scan paper question: %w", err)
		}
		questions = append(questions, q)
	}
	if err := rows.Err(); err != nil {
		return PaperDetail{}, fmt.Errorf("iterate paper questions: %w", err)
	}
	return PaperDetail{Paper: p, Questions: questions}, nil
}

type CreatePaperParams struct {
	OrgID     string
	Type      string
	Title     string
	Rules     json.RawMessage
	Questions []PaperQuestionInput
	CreatedBy string
}

func (s *Store) CreatePaper(ctx context.Context, p CreatePaperParams) (PaperDetail, error) {
	totalScore, err := s.preparePaper(ctx, p.OrgID, p.Type, p.Rules, p.Questions)
	if err != nil {
		return PaperDetail{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return PaperDetail{}, fmt.Errorf("begin create paper: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var paperID string
	err = tx.QueryRow(ctx, `
		INSERT INTO papers (org_id, type, title, total_score, rules, created_by)
		VALUES ($1, $2, $3, $4, $5::jsonb, NULLIF($6, '')::uuid)
		RETURNING id::text`,
		p.OrgID, p.Type, p.Title, totalScore, string(normalizeRaw(p.Rules)), p.CreatedBy,
	).Scan(&paperID)
	if err != nil {
		return PaperDetail{}, fmt.Errorf("insert paper: %w", err)
	}
	if err := insertPaperQuestions(ctx, tx, paperID, p.Questions); err != nil {
		return PaperDetail{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return PaperDetail{}, fmt.Errorf("commit create paper: %w", err)
	}
	return s.GetPaper(ctx, p.OrgID, paperID)
}

func (s *Store) UpdatePaper(ctx context.Context, orgID, paperID string, p CreatePaperParams) (PaperDetail, error) {
	detail, err := s.GetPaper(ctx, orgID, paperID)
	if err != nil {
		return PaperDetail{}, err
	}
	if detail.Status != "draft" {
		return PaperDetail{}, ErrInvalidState
	}
	totalScore, err := s.preparePaper(ctx, orgID, p.Type, p.Rules, p.Questions)
	if err != nil {
		return PaperDetail{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return PaperDetail{}, fmt.Errorf("begin update paper: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	_, err = tx.Exec(ctx, `
		UPDATE papers
		SET type = $1, title = $2, total_score = $3, rules = $4::jsonb, version = version + 1
		WHERE id = $5 AND org_id = $6`,
		p.Type, p.Title, totalScore, string(normalizeRaw(p.Rules)), paperID, orgID,
	)
	if err != nil {
		return PaperDetail{}, fmt.Errorf("update paper: %w", err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM paper_questions WHERE paper_id = $1`, paperID); err != nil {
		return PaperDetail{}, fmt.Errorf("clear paper questions: %w", err)
	}
	if err := insertPaperQuestions(ctx, tx, paperID, p.Questions); err != nil {
		return PaperDetail{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return PaperDetail{}, fmt.Errorf("commit update paper: %w", err)
	}
	return s.GetPaper(ctx, orgID, paperID)
}

func (s *Store) SubmitPaperReview(ctx context.Context, orgID, paperID string) (PaperDetail, error) {
	tag, err := s.pool.Exec(ctx, `
		UPDATE papers SET status = 'pending_review'
		WHERE id = $1 AND org_id = $2 AND status = 'draft'`, paperID, orgID)
	if err != nil {
		return PaperDetail{}, fmt.Errorf("submit paper review: %w", err)
	}
	if tag.RowsAffected() == 0 {
		if _, err := s.GetPaper(ctx, orgID, paperID); err != nil {
			return PaperDetail{}, err
		}
		return PaperDetail{}, ErrInvalidState
	}
	return s.GetPaper(ctx, orgID, paperID)
}

func (s *Store) ApprovePaper(ctx context.Context, orgID, paperID string) (PaperDetail, error) {
	tag, err := s.pool.Exec(ctx, `
		UPDATE papers SET status = 'approved'
		WHERE id = $1 AND org_id = $2 AND status = 'pending_review'`, paperID, orgID)
	if err != nil {
		return PaperDetail{}, fmt.Errorf("approve paper: %w", err)
	}
	if tag.RowsAffected() == 0 {
		if _, err := s.GetPaper(ctx, orgID, paperID); err != nil {
			return PaperDetail{}, err
		}
		return PaperDetail{}, ErrInvalidState
	}
	return s.GetPaper(ctx, orgID, paperID)
}

func (s *Store) preparePaper(ctx context.Context, orgID, paperType string, rules json.RawMessage, questions []PaperQuestionInput) (float64, error) {
	switch paperType {
	case "fixed", "ab":
		if len(questions) == 0 {
			return 0, fmt.Errorf("paper requires questions: %w", ErrInvalidState)
		}
		ids := make([]string, 0, len(questions))
		total := 0.0
		for _, q := range questions {
			if q.Score <= 0 {
				return 0, fmt.Errorf("question score must be positive: %w", ErrInvalidState)
			}
			ids = append(ids, q.QuestionID)
			total += q.Score
		}
		var publishedCount int
		if err := s.pool.QueryRow(ctx, `
			SELECT count(*) FROM questions
			WHERE org_id = $1 AND status = 'published' AND id::text = ANY($2::text[])`,
			orgID, ids,
		).Scan(&publishedCount); err != nil {
			return 0, fmt.Errorf("validate paper questions: %w", err)
		}
		if publishedCount != len(ids) {
			return 0, fmt.Errorf("all paper questions must exist and be published: %w", ErrInvalidState)
		}
		return total, nil
	case "random":
		parsed, err := ParseRandomRules(normalizeRaw(rules))
		if err != nil {
			return 0, fmt.Errorf("%w: %v", ErrInvalidState, err)
		}
		total := 0.0
		for _, section := range parsed.Sections {
			total += float64(section.Count) * section.Score
		}
		return total, nil
	default:
		return 0, fmt.Errorf("invalid paper type: %w", ErrInvalidState)
	}
}

func insertPaperQuestions(ctx context.Context, db DBTX, paperID string, questions []PaperQuestionInput) error {
	for index, q := range questions {
		group := q.PaperGroup
		if group == "" {
			group = "A"
		}
		if _, err := db.Exec(ctx, `
			INSERT INTO paper_questions (paper_id, question_id, section, sort_order, score, paper_group)
			VALUES ($1, $2, $3, $4, $5, $6)`,
			paperID, q.QuestionID, q.Section, index, q.Score, group,
		); err != nil {
			return fmt.Errorf("insert paper question: %w", mapUniqueViolation(err))
		}
	}
	return nil
}

func normalizeRaw(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 {
		return json.RawMessage(`{}`)
	}
	return raw
}
