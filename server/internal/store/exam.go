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

type Exam struct {
	ID              string          `json:"id"`
	PaperID         string          `json:"paper_id"`
	PaperTitle      string          `json:"paper_title"`
	PaperType       string          `json:"paper_type"`
	Title           string          `json:"title"`
	StartAt         time.Time       `json:"start_at"`
	EndAt           time.Time       `json:"end_at"`
	DurationMinutes int             `json:"duration_minutes"`
	Status          string          `json:"status"`
	Rules           json.RawMessage `json:"rules"`
	ProctorConfig   json.RawMessage `json:"proctor_config"`
	CandidateCount  int64           `json:"candidate_count"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

type CandidateInput struct {
	UserID     string `json:"user_id"`
	PaperGroup string `json:"paper_group"`
}

type CreateExamParams struct {
	OrgID           string
	PaperID         string
	Title           string
	StartAt         time.Time
	EndAt           time.Time
	DurationMinutes int
	Rules           json.RawMessage
	ProctorConfig   json.RawMessage
	Candidates      []CandidateInput
	ClassIDs        []string
	CreatedBy       string
}

type ExamCandidate struct {
	ID         string    `json:"id"`
	UserID     string    `json:"user_id"`
	Name       string    `json:"name"`
	Username   string    `json:"username"`
	Phone      string    `json:"phone"`
	TicketNo   string    `json:"ticket_no"`
	Status     string    `json:"status"`
	PaperGroup string    `json:"paper_group"`
	AttemptID  *string   `json:"attempt_id"`
	CreatedAt  time.Time `json:"created_at"`
}

type MyExam struct {
	ID              string    `json:"id"`
	Title           string    `json:"title"`
	StartAt         time.Time `json:"start_at"`
	EndAt           time.Time `json:"end_at"`
	DurationMinutes int       `json:"duration_minutes"`
	ExamStatus      string    `json:"exam_status"`
	CandidateStatus string    `json:"candidate_status"`
	AttemptID       *string   `json:"attempt_id"`
	Score           *float64  `json:"score"`
	ScoreStatus     string    `json:"score_status"`
}

const examSelect = `e.id::text, e.paper_id::text, p.title, p.type, e.title, e.start_at, e.end_at,
	e.duration_minutes, e.status, e.rules, e.proctor_config,
	(SELECT count(*) FROM exam_candidates ec WHERE ec.exam_id = e.id), e.created_at, e.updated_at`

func examScanDest(e *Exam) []any {
	return []any{
		&e.ID, &e.PaperID, &e.PaperTitle, &e.PaperType, &e.Title, &e.StartAt, &e.EndAt,
		&e.DurationMinutes, &e.Status, &e.Rules, &e.ProctorConfig, &e.CandidateCount, &e.CreatedAt, &e.UpdatedAt,
	}
}

type ExamFilter struct {
	Status   string
	Keyword  string
	Page     int
	PageSize int
}

func (s *Store) ListExams(ctx context.Context, orgID string, f ExamFilter) ([]Exam, int64, error) {
	where := []string{"e.org_id = $1"}
	args := []any{orgID}
	if f.Status != "" {
		args = append(args, f.Status)
		where = append(where, fmt.Sprintf("e.status = $%d", len(args)))
	}
	if f.Keyword != "" {
		args = append(args, "%"+f.Keyword+"%")
		where = append(where, fmt.Sprintf("e.title ILIKE $%d", len(args)))
	}
	whereSQL := strings.Join(where, " AND ")

	var total int64
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM exams e WHERE `+whereSQL, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count exams: %w", err)
	}

	args = append(args, f.PageSize, (f.Page-1)*f.PageSize)
	rows, err := s.pool.Query(ctx, `
		SELECT `+examSelect+`
		FROM exams e
		JOIN papers p ON p.id = e.paper_id
		WHERE `+whereSQL+`
		ORDER BY e.start_at DESC
		LIMIT $`+fmt.Sprint(len(args)-1)+` OFFSET $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list exams: %w", err)
	}
	defer rows.Close()

	exams := make([]Exam, 0, f.PageSize)
	for rows.Next() {
		var e Exam
		if err := rows.Scan(examScanDest(&e)...); err != nil {
			return nil, 0, fmt.Errorf("scan exam: %w", err)
		}
		exams = append(exams, e)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("iterate exams: %w", err)
	}
	return exams, total, nil
}

func (s *Store) GetExam(ctx context.Context, orgID, examID string) (Exam, error) {
	var e Exam
	err := s.pool.QueryRow(ctx, `
		SELECT `+examSelect+`
		FROM exams e JOIN papers p ON p.id = e.paper_id
		WHERE e.id = $1 AND e.org_id = $2`, examID, orgID).Scan(examScanDest(&e)...)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Exam{}, ErrNotFound
		}
		return Exam{}, fmt.Errorf("get exam: %w", err)
	}
	return e, nil
}

func (s *Store) CreateExam(ctx context.Context, p CreateExamParams) (Exam, error) {
	if p.DurationMinutes <= 0 || !p.EndAt.After(p.StartAt) {
		return Exam{}, fmt.Errorf("invalid exam time window: %w", ErrInvalidState)
	}

	var paperStatus, paperType string
	err := s.pool.QueryRow(ctx, `SELECT status, type FROM papers WHERE id = $1::uuid AND org_id = $2`, p.PaperID, p.OrgID).
		Scan(&paperStatus, &paperType)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Exam{}, ErrNotFound
		}
		return Exam{}, fmt.Errorf("load paper for exam: %w", err)
	}
	if paperStatus != "approved" {
		return Exam{}, fmt.Errorf("paper must be approved before creating an exam: %w", ErrInvalidState)
	}

	candidates, err := s.expandCandidates(ctx, p.OrgID, paperType, p.Candidates, p.ClassIDs)
	if err != nil {
		return Exam{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Exam{}, fmt.Errorf("begin create exam: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var examID string
	err = tx.QueryRow(ctx, `
		INSERT INTO exams (org_id, paper_id, title, start_at, end_at, duration_minutes, rules, proctor_config, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, NULLIF($9, '')::uuid)
		RETURNING id::text`,
		p.OrgID, p.PaperID, p.Title, p.StartAt, p.EndAt, p.DurationMinutes,
		string(normalizeRaw(p.Rules)), string(normalizeRaw(p.ProctorConfig)), p.CreatedBy,
	).Scan(&examID)
	if err != nil {
		return Exam{}, fmt.Errorf("insert exam: %w", err)
	}
	if err := insertCandidates(ctx, tx, examID, candidates); err != nil {
		return Exam{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Exam{}, fmt.Errorf("commit create exam: %w", err)
	}
	return s.GetExam(ctx, p.OrgID, examID)
}

func (s *Store) PublishExam(ctx context.Context, orgID, examID string) (Exam, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Exam{}, fmt.Errorf("begin publish exam: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var (
		examStatus  string
		examTitle   string
		startAt     time.Time
		endAt       time.Time
		duration    int
		paperID     string
		paperTitle  string
		paperType   string
		paperStatus string
		rules       json.RawMessage
	)
	err = tx.QueryRow(ctx, `
		SELECT e.status, e.title, e.start_at, e.end_at, e.duration_minutes,
			e.paper_id::text, p.title, p.type, p.status, p.rules
		FROM exams e JOIN papers p ON p.id = e.paper_id
		WHERE e.id = $1 AND e.org_id = $2
		FOR UPDATE OF e`, examID, orgID,
	).Scan(&examStatus, &examTitle, &startAt, &endAt, &duration,
		&paperID, &paperTitle, &paperType, &paperStatus, &rules)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Exam{}, ErrNotFound
		}
		return Exam{}, fmt.Errorf("load exam for publish: %w", err)
	}
	if examStatus != "draft" && examStatus != "pending_publish" {
		return Exam{}, ErrInvalidState
	}
	if paperStatus != "approved" {
		return Exam{}, fmt.Errorf("paper is not approved: %w", ErrInvalidState)
	}

	var candidateCount int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM exam_candidates WHERE exam_id = $1`, examID).Scan(&candidateCount); err != nil {
		return Exam{}, fmt.Errorf("count exam candidates: %w", err)
	}
	if candidateCount == 0 {
		return Exam{}, fmt.Errorf("exam requires at least one candidate: %w", ErrInvalidState)
	}

	snapshot, err := s.buildSnapshot(ctx, tx, orgID, paperID, paperTitle, paperType, rules)
	if err != nil {
		return Exam{}, err
	}
	payload, err := json.Marshal(snapshot)
	if err != nil {
		return Exam{}, fmt.Errorf("marshal paper snapshot: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO paper_snapshots (exam_id, paper_id, payload)
		VALUES ($1, $2, $3::jsonb)`, examID, paperID, string(payload),
	); err != nil {
		return Exam{}, fmt.Errorf("insert paper snapshot: %w", mapUniqueViolation(err))
	}
	if _, err := tx.Exec(ctx, `UPDATE exams SET status = 'pending_start' WHERE id = $1`, examID); err != nil {
		return Exam{}, fmt.Errorf("mark exam published: %w", err)
	}

	candidates, err := listCandidateUserIDs(ctx, tx, examID)
	if err != nil {
		return Exam{}, err
	}
	notice := fmt.Sprintf("考试时间 %s 至 %s，限时 %d 分钟，请按时参加。",
		startAt.Format("2006-01-02 15:04"), endAt.Format("2006-01-02 15:04"), duration)
	if err := notifyMany(ctx, tx, orgID, candidates,
		fmt.Sprintf("考试发布：%s", examTitle), notice, "exam_publish", examID); err != nil {
		return Exam{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Exam{}, fmt.Errorf("commit publish exam: %w", err)
	}
	s.emit(RealtimeEvent{
		Type:   EventExamPublished,
		ExamID: examID,
		Detail: map[string]any{
			"exam_title":      examTitle,
			"candidate_count": len(candidates),
			"start_at":        startAt,
		},
	})
	return s.GetExam(ctx, orgID, examID)
}

func listCandidateUserIDs(ctx context.Context, db DBTX, examID string) ([]string, error) {
	rows, err := db.Query(ctx, `SELECT user_id::text FROM exam_candidates WHERE exam_id = $1::uuid ORDER BY created_at`, examID)
	if err != nil {
		return nil, fmt.Errorf("list exam candidate ids: %w", err)
	}
	defer rows.Close()

	ids := make([]string, 0)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan exam candidate id: %w", err)
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate exam candidate ids: %w", err)
	}
	return ids, nil
}

func (s *Store) buildSnapshot(ctx context.Context, tx pgx.Tx, orgID, paperID, paperTitle, paperType string, rules json.RawMessage) (PaperSnapshot, error) {
	snapshot := PaperSnapshot{PaperID: paperID, PaperTitle: paperTitle, PaperType: paperType, Questions: []SnapshotQuestion{}}

	if paperType == "fixed" || paperType == "ab" {
		var unpublished int
		if err := tx.QueryRow(ctx, `
			SELECT count(*) FROM paper_questions pq
			JOIN questions q ON q.id = pq.question_id
			WHERE pq.paper_id = $1 AND q.status <> 'published'`, paperID).Scan(&unpublished); err != nil {
			return snapshot, fmt.Errorf("check paper questions: %w", err)
		}
		if unpublished > 0 {
			return snapshot, fmt.Errorf("paper contains unpublished questions: %w", ErrInvalidState)
		}

		rows, err := tx.Query(ctx, `
			SELECT pq.question_id::text, q.type, pq.section, pq.paper_group, q.difficulty, q.knowledge_point,
				q.content, q.answer, q.score_rule, pq.score::float8
			FROM paper_questions pq
			JOIN questions q ON q.id = pq.question_id
			WHERE pq.paper_id = $1
			ORDER BY pq.paper_group, pq.sort_order`, paperID)
		if err != nil {
			return snapshot, fmt.Errorf("load paper questions for snapshot: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var q SnapshotQuestion
			if err := rows.Scan(&q.QuestionID, &q.Type, &q.Section, &q.PaperGroup, &q.Difficulty, &q.KnowledgePoint,
				&q.Content, &q.Answer, &q.ScoreRule, &q.Score); err != nil {
				return snapshot, fmt.Errorf("scan snapshot question: %w", err)
			}
			snapshot.Questions = append(snapshot.Questions, q)
			snapshot.TotalScore += q.Score
		}
		if err := rows.Err(); err != nil {
			return snapshot, fmt.Errorf("iterate snapshot questions: %w", err)
		}
		if len(snapshot.Questions) == 0 {
			return snapshot, fmt.Errorf("paper has no questions: %w", ErrInvalidState)
		}
		return snapshot, nil
	}

	parsed, err := ParseRandomRules(normalizeRaw(rules))
	if err != nil {
		return snapshot, fmt.Errorf("%w: %v", ErrInvalidState, err)
	}
	selected := make([]string, 0)
	for _, section := range parsed.Sections {
		questions, err := drawPublishedQuestions(ctx, tx, orgID, QuestionDraw{
			BankID:         section.BankID,
			Type:           section.Type,
			Difficulty:     section.Difficulty,
			KnowledgePoint: section.KnowledgePoint,
			ExcludeIDs:     selected,
			Limit:          section.Count,
		})
		if err != nil {
			return snapshot, err
		}
		if len(questions) < section.Count {
			return snapshot, fmt.Errorf("section %q: %w", section.Name, ErrInsufficientQuestions)
		}
		for _, q := range questions {
			selected = append(selected, q.ID)
			snapshot.Questions = append(snapshot.Questions, SnapshotQuestion{
				QuestionID:     q.ID,
				Type:           q.Type,
				Section:        section.Name,
				PaperGroup:     "A",
				Difficulty:     q.Difficulty,
				KnowledgePoint: q.KnowledgePoint,
				Content:        q.Content,
				Answer:         q.Answer,
				ScoreRule:      q.ScoreRule,
				Score:          section.Score,
			})
			snapshot.TotalScore += section.Score
		}
	}
	if len(snapshot.Questions) == 0 {
		return snapshot, fmt.Errorf("random paper produced no questions: %w", ErrInvalidState)
	}
	return snapshot, nil
}

func (s *Store) GetSnapshot(ctx context.Context, examID string) (PaperSnapshot, error) {
	var payload []byte
	err := s.pool.QueryRow(ctx, `SELECT payload FROM paper_snapshots WHERE exam_id = $1`, examID).Scan(&payload)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return PaperSnapshot{}, ErrNotFound
		}
		return PaperSnapshot{}, fmt.Errorf("load paper snapshot: %w", err)
	}
	var snapshot PaperSnapshot
	if err := json.Unmarshal(payload, &snapshot); err != nil {
		return PaperSnapshot{}, fmt.Errorf("parse paper snapshot: %w", err)
	}
	return snapshot, nil
}

func (s *Store) ListExamCandidates(ctx context.Context, orgID, examID string, page, pageSize int) ([]ExamCandidate, int64, error) {
	var exists bool
	if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM exams WHERE id = $1 AND org_id = $2)`, examID, orgID).Scan(&exists); err != nil {
		return nil, 0, fmt.Errorf("check exam: %w", err)
	}
	if !exists {
		return nil, 0, ErrNotFound
	}

	var total int64
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM exam_candidates WHERE exam_id = $1`, examID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count exam candidates: %w", err)
	}

	rows, err := s.pool.Query(ctx, `
		SELECT ec.id::text, ec.user_id::text, u.name, u.username, u.phone, ec.ticket_no,
			ec.status, ec.paper_group, ec.attempt_id::text, ec.created_at
		FROM exam_candidates ec
		JOIN users u ON u.id = ec.user_id
		WHERE ec.exam_id = $1
		ORDER BY ec.created_at
		LIMIT $2 OFFSET $3`, examID, pageSize, (page-1)*pageSize)
	if err != nil {
		return nil, 0, fmt.Errorf("list exam candidates: %w", err)
	}
	defer rows.Close()

	candidates := make([]ExamCandidate, 0, pageSize)
	for rows.Next() {
		var c ExamCandidate
		if err := rows.Scan(&c.ID, &c.UserID, &c.Name, &c.Username, &c.Phone, &c.TicketNo,
			&c.Status, &c.PaperGroup, &c.AttemptID, &c.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan exam candidate: %w", err)
		}
		candidates = append(candidates, c)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("iterate exam candidates: %w", err)
	}
	return candidates, total, nil
}

type AddCandidatesParams struct {
	OrgID      string
	ExamID     string
	Candidates []CandidateInput
	ClassIDs   []string
}

func (s *Store) AddExamCandidates(ctx context.Context, p AddCandidatesParams) (int64, error) {
	var examStatus, paperType string
	err := s.pool.QueryRow(ctx, `
		SELECT e.status, p.type
		FROM exams e JOIN papers p ON p.id = e.paper_id
		WHERE e.id = $1 AND e.org_id = $2`, p.ExamID, p.OrgID).Scan(&examStatus, &paperType)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, ErrNotFound
		}
		return 0, fmt.Errorf("load exam for candidates: %w", err)
	}
	if examStatus != "draft" && examStatus != "pending_publish" {
		return 0, ErrInvalidState
	}

	candidates, err := s.expandCandidates(ctx, p.OrgID, paperType, p.Candidates, p.ClassIDs)
	if err != nil {
		return 0, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("begin add candidates: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var added int64
	for _, candidate := range candidates {
		tag, err := tx.Exec(ctx, `
			INSERT INTO exam_candidates (exam_id, user_id, paper_group)
			VALUES ($1, $2, $3)
			ON CONFLICT (exam_id, user_id) DO NOTHING`,
			p.ExamID, candidate.UserID, candidate.PaperGroup,
		)
		if err != nil {
			return 0, fmt.Errorf("insert exam candidate: %w", err)
		}
		added += tag.RowsAffected()
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit add candidates: %w", err)
	}
	return added, nil
}

func insertCandidates(ctx context.Context, db DBTX, examID string, candidates []CandidateInput) error {
	for _, candidate := range candidates {
		if _, err := db.Exec(ctx, `
			INSERT INTO exam_candidates (exam_id, user_id, paper_group)
			VALUES ($1, $2, $3)`, examID, candidate.UserID, candidate.PaperGroup,
		); err != nil {
			return fmt.Errorf("insert exam candidate: %w", mapUniqueViolation(err))
		}
	}
	return nil
}

func (s *Store) expandCandidates(ctx context.Context, orgID, paperType string, inputs []CandidateInput, classIDs []string) ([]CandidateInput, error) {
	all := make([]CandidateInput, 0, len(inputs))
	seen := make(map[string]struct{})
	for _, input := range inputs {
		if input.UserID == "" {
			continue
		}
		if _, ok := seen[input.UserID]; ok {
			continue
		}
		seen[input.UserID] = struct{}{}
		group := input.PaperGroup
		if paperType != "ab" {
			group = "A"
		} else {
			if group == "" {
				group = "A"
			}
			if group != "A" && group != "B" {
				return nil, fmt.Errorf("invalid paper group %q: %w", group, ErrInvalidState)
			}
		}
		all = append(all, CandidateInput{UserID: input.UserID, PaperGroup: group})
	}

	for _, classID := range classIDs {
		rows, err := s.pool.Query(ctx, `
			SELECT id::text FROM users
			WHERE org_id = $1 AND class_id = $2::uuid AND role = 'student' AND status = 'active'
			ORDER BY created_at`, orgID, classID)
		if err != nil {
			return nil, fmt.Errorf("load class users: %w", err)
		}
		for rows.Next() {
			var userID string
			if err := rows.Scan(&userID); err != nil {
				rows.Close()
				return nil, fmt.Errorf("scan class user: %w", err)
			}
			if _, ok := seen[userID]; ok {
				continue
			}
			seen[userID] = struct{}{}
			group := "A"
			if paperType == "ab" && len(all)%2 == 1 {
				group = "B"
			}
			all = append(all, CandidateInput{UserID: userID, PaperGroup: group})
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, fmt.Errorf("iterate class users: %w", err)
		}
		rows.Close()
	}

	if len(all) == 0 {
		return all, nil
	}
	ids := make([]string, 0, len(all))
	for _, candidate := range all {
		ids = append(ids, candidate.UserID)
	}
	var validCount int
	if err := s.pool.QueryRow(ctx, `
		SELECT count(*) FROM users
		WHERE org_id = $1 AND role = 'student' AND status = 'active' AND id::text = ANY($2::text[])`,
		orgID, ids,
	).Scan(&validCount); err != nil {
		return nil, fmt.Errorf("validate exam candidates: %w", err)
	}
	if validCount != len(ids) {
		return nil, fmt.Errorf("all candidates must be active students in the organization: %w", ErrInvalidState)
	}
	return all, nil
}

func (s *Store) ListMyExams(ctx context.Context, orgID, userID string) ([]MyExam, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT e.id::text, e.title, e.start_at, e.end_at, e.duration_minutes,
			e.status, ec.status, ec.attempt_id::text,
			CASE WHEN sr.status = 'published' THEN sr.total ELSE NULL END::float8,
			COALESCE(sr.status, '')
		FROM exam_candidates ec
		JOIN exams e ON e.id = ec.exam_id
		LEFT JOIN LATERAL (
			SELECT total, status FROM score_records
			WHERE attempt_id = ec.attempt_id
			ORDER BY created_at DESC LIMIT 1
		) sr ON true
		WHERE ec.user_id = $1 AND e.org_id = $2
			AND e.status NOT IN ('draft', 'pending_publish', 'archived')
		ORDER BY e.start_at DESC`, userID, orgID)
	if err != nil {
		return nil, fmt.Errorf("list my exams: %w", err)
	}
	defer rows.Close()

	exams := make([]MyExam, 0)
	for rows.Next() {
		var e MyExam
		if err := rows.Scan(&e.ID, &e.Title, &e.StartAt, &e.EndAt, &e.DurationMinutes,
			&e.ExamStatus, &e.CandidateStatus, &e.AttemptID, &e.Score, &e.ScoreStatus); err != nil {
			return nil, fmt.Errorf("scan my exam: %w", err)
		}
		exams = append(exams, e)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate my exams: %w", err)
	}
	return exams, nil
}
