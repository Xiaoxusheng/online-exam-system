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

// exportRowLimit keeps a workbook openable in desktop Excel.
const exportRowLimit = 5000

// ListQuestionsForExport returns the questions visible to the caller for a given filter.
// It ignores pagination and stops at exportRowLimit.
func (s *Store) ListQuestionsForExport(ctx context.Context, scope Scope, f QuestionFilter) ([]Question, error) {
	visSQL, visArgs := scope.bankVisibility("b", 2)
	where := []string{"q.org_id = $1", "EXISTS (SELECT 1 FROM question_banks b WHERE b.id = q.bank_id" + visSQL + ")"}
	args := append([]any{scope.OrgID}, visArgs...)

	if f.BankID != "" {
		args = append(args, f.BankID)
		where = append(where, fmt.Sprintf("q.bank_id = $%d::uuid", len(args)))
	}
	if f.Type != "" {
		args = append(args, f.Type)
		where = append(where, fmt.Sprintf("q.type = $%d", len(args)))
	}
	if f.Difficulty != "" {
		args = append(args, f.Difficulty)
		where = append(where, fmt.Sprintf("q.difficulty = $%d", len(args)))
	}
	if f.Status != "" {
		args = append(args, f.Status)
		where = append(where, fmt.Sprintf("q.status = $%d", len(args)))
	}
	if f.Keyword != "" {
		args = append(args, "%"+f.Keyword+"%")
		n := len(args)
		where = append(where, fmt.Sprintf("(q.content->>'stem' ILIKE $%d OR q.knowledge_point ILIKE $%d)", n, n))
	}
	args = append(args, exportRowLimit)

	rows, err := s.pool.Query(ctx, `
		SELECT q.id::text, q.bank_id::text, q.type, q.knowledge_point, q.difficulty, q.content, q.answer,
			q.score_rule, q.default_score::float8, q.status, q.version, q.created_at, q.updated_at
		FROM questions q
		WHERE `+strings.Join(where, " AND ")+`
		ORDER BY q.updated_at DESC, q.id DESC
		LIMIT $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, fmt.Errorf("export questions: %w", err)
	}
	defer rows.Close()

	items := make([]Question, 0, 64)
	for rows.Next() {
		var q Question
		if err := rows.Scan(questionScanDest(&q)...); err != nil {
			return nil, fmt.Errorf("scan exported question: %w", err)
		}
		items = append(items, q)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate exported questions: %w", err)
	}
	return items, nil
}

// FindBankByName resolves a bank by its exact name among the banks visible to the caller.
func (s *Store) FindBankByName(ctx context.Context, scope Scope, name string) (QuestionBank, error) {
	visSQL, visArgs := scope.bankVisibility("b", 3)
	rows, err := s.pool.Query(ctx, `
		SELECT b.id::text, b.name, b.scope, b.status, count(q.id), b.created_at
		FROM question_banks b
		LEFT JOIN questions q ON q.bank_id = b.id
		WHERE b.org_id = $1 AND b.name = $2`+visSQL+`
		GROUP BY b.id
		ORDER BY b.created_at ASC
		LIMIT 2`, append([]any{scope.OrgID, name}, visArgs...)...)
	if err != nil {
		return QuestionBank{}, fmt.Errorf("find bank by name: %w", err)
	}
	defer rows.Close()

	var found []QuestionBank
	for rows.Next() {
		var item QuestionBank
		if err := rows.Scan(&item.ID, &item.Name, &item.Scope, &item.Status, &item.QuestionCount, &item.CreatedAt); err != nil {
			return QuestionBank{}, fmt.Errorf("scan bank: %w", err)
		}
		found = append(found, item)
	}
	if err := rows.Err(); err != nil {
		return QuestionBank{}, fmt.Errorf("iterate banks: %w", err)
	}
	if len(found) == 0 {
		return QuestionBank{}, ErrNotFound
	}
	if len(found) > 1 {
		return QuestionBank{}, ErrConflict
	}
	return found[0], nil
}

// HasQuestionWithStem reports whether an identical stem already exists in the bank so a
// repeated import stays idempotent instead of duplicating the whole sheet.
func (s *Store) HasQuestionWithStem(ctx context.Context, bankID, stem string) (bool, error) {
	var exists bool
	if err := s.pool.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM questions WHERE bank_id = $1::uuid AND trim(content->>'stem') = $2)`,
		bankID, stem).Scan(&exists); err != nil {
		return false, fmt.Errorf("check question stem: %w", err)
	}
	return exists, nil
}

type ScoreExportRow struct {
	UserName     string
	Username     string
	CampusName   string
	ClassName    string
	TicketNo     string
	Group        string
	MaxScore     float64
	PassScore    float64
	Total        float64
	ScoreStatus  string
	AttemptState string
	StartedAt    time.Time
	SubmittedAt  *time.Time
	PublishedAt  *time.Time
	Passed       bool
}

// ListScoresForExport returns every graded attempt of one exam inside the caller's data scope.
func (s *Store) ListScoresForExport(ctx context.Context, scope Scope, examID string) ([]ScoreExportRow, ExamExportMeta, error) {
	var meta ExamExportMeta
	var rulesRaw []byte
	err := s.pool.QueryRow(ctx, `
		SELECT e.title, p.title, e.rules
		FROM exams e JOIN papers p ON p.id = e.paper_id
		WHERE e.id = $1::uuid AND e.org_id = $2`, examID, scope.OrgID).
		Scan(&meta.ExamTitle, &meta.PaperTitle, &rulesRaw)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ExamExportMeta{}, ErrNotFound
		}
		return nil, ExamExportMeta{}, fmt.Errorf("load exam for export: %w", err)
	}
	// The paper row sums every group, so the reachable full score comes from the snapshot.
	snapshot, err := s.GetSnapshot(ctx, examID)
	if err != nil {
		return nil, ExamExportMeta{}, err
	}
	meta.TotalScore = snapshot.DisplayTotal()
	meta.PassScore = passScoreOf(rulesRaw, meta.TotalScore)

	scopeSQL, scopeArgs := scope.peopleFilter("u", 3)
	args := append([]any{examID, scope.OrgID}, scopeArgs...)
	rows, err := s.pool.Query(ctx, `
		SELECT u.name, u.username, COALESCE(cp.name, ''), COALESCE(cl.name, ''), ec.ticket_no,
			a.paper_group, sr.total::float8, sr.status, a.status, a.started_at, a.submitted_at, sr.published_at
		FROM attempts a
		JOIN users u ON u.id = a.user_id
		JOIN exams e ON e.id = a.exam_id
		JOIN LATERAL (
			SELECT total, status, published_at, created_at FROM score_records
			WHERE attempt_id = a.id ORDER BY created_at DESC LIMIT 1
		) sr ON true
		LEFT JOIN exam_candidates ec ON ec.exam_id = a.exam_id AND ec.user_id = a.user_id
		LEFT JOIN campuses cp ON cp.id = u.campus_id
		LEFT JOIN classes cl ON cl.id = u.class_id
		WHERE a.exam_id = $1::uuid AND e.org_id = $2`+scopeSQL+`
			AND a.status IN ('submitted', 'graded', 'published')
		ORDER BY sr.total DESC NULLS LAST, u.name ASC, u.id ASC
		LIMIT `+fmt.Sprint(exportRowLimit), args...)
	if err != nil {
		return nil, ExamExportMeta{}, fmt.Errorf("export scores: %w", err)
	}
	defer rows.Close()

	items := make([]ScoreExportRow, 0, 64)
	for rows.Next() {
		var item ScoreExportRow
		if err := rows.Scan(&item.UserName, &item.Username, &item.CampusName, &item.ClassName, &item.TicketNo,
			&item.Group, &item.Total, &item.ScoreStatus, &item.AttemptState, &item.StartedAt, &item.SubmittedAt,
			&item.PublishedAt); err != nil {
			return nil, ExamExportMeta{}, fmt.Errorf("scan exported score: %w", err)
		}
		item.MaxScore = groupTotalOf(snapshot, meta.TotalScore, item.Group)
		item.PassScore = passScoreOf(rulesRaw, item.MaxScore)
		item.Passed = item.Total >= item.PassScore
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, ExamExportMeta{}, fmt.Errorf("iterate exported scores: %w", err)
	}
	return items, meta, nil
}

type ExamExportMeta struct {
	ExamTitle  string  `json:"exam_title"`
	PaperTitle string  `json:"paper_title"`
	TotalScore float64 `json:"total_score"`
	PassScore  float64 `json:"pass_score"`
}

// passScoreOf resolves the pass line from exam rules, defaulting to 60% of the total.
// An explicitly configured line is absolute and applies to every paper group.
func passScoreOf(rulesRaw []byte, total float64) float64 {
	if configured := configuredPassScore(rulesRaw); configured > 0 {
		return configured
	}
	if total > 0 {
		return math.Round(total*0.6*100) / 100
	}
	return 0
}

func configuredPassScore(rulesRaw []byte) float64 {
	var rules struct {
		PassScore float64 `json:"pass_score"`
	}
	_ = json.Unmarshal(rulesRaw, &rules)
	return rules.PassScore
}

// passScoreFor is the pass line for one paper group: an explicitly configured line
// stays absolute for every group, otherwise 60% of what that group can reach.
func passScoreFor(rulesRaw []byte, groupMax float64) float64 {
	return passScoreOf(rulesRaw, groupMax)
}

// groupTotalOf is the full score one paper group can reach, falling back to the exam
// total for snapshots that carry no per-group sums.
func groupTotalOf(snapshot PaperSnapshot, fallback float64, group string) float64 {
	if total := snapshot.TotalFor(group); total > 0 {
		return total
	}
	return fallback
}
