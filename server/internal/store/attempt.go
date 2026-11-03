package store

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"time"

	"github.com/jackc/pgx/v5"

	"online-exam-system/server/internal/grading"
)

type AttemptQuestion struct {
	QuestionID     string          `json:"question_id"`
	Type           string          `json:"type"`
	Section        string          `json:"section"`
	PaperGroup     string          `json:"paper_group"`
	Difficulty     string          `json:"difficulty"`
	KnowledgePoint string          `json:"knowledge_point"`
	Content        json.RawMessage `json:"content"`
	Score          float64         `json:"score"`
	SavedAnswer    json.RawMessage `json:"saved_answer"`
	AnswerVersion  int             `json:"answer_version"`
}

type AttemptState struct {
	AttemptID        string            `json:"attempt_id"`
	ExamID           string            `json:"exam_id"`
	ExamTitle        string            `json:"exam_title"`
	Status           string            `json:"status"`
	PaperGroup       string            `json:"paper_group"`
	StartedAt        time.Time         `json:"started_at"`
	Deadline         time.Time         `json:"deadline"`
	ServerTime       time.Time         `json:"server_time"`
	RemainingSeconds int               `json:"remaining_seconds"`
	TotalScore       float64           `json:"total_score"`
	Questions        []AttemptQuestion `json:"questions"`
	Score            *float64          `json:"score"`
	PendingReview    int               `json:"pending_review"`
	// Rules is the candidate-visible subset of exam rules (anti-cheat toggles);
	// grading or staffing fields never reach this payload.
	Rules AttemptRules `json:"rules"`
}

// AttemptRules mirrors the exam rules a candidate client acts on.
type AttemptRules struct {
	DisablePaste      bool `json:"disable_paste"`
	RestrictMobile    bool `json:"restrict_mobile"`
	ScreenSwitchLimit int  `json:"screen_switch_limit"`
	SnapshotInterval  int  `json:"snapshot_interval"`
}

// ParseAttemptRules extracts the candidate-visible subset; zero values keep
// existing exams unaffected (no paste block, no mobile restriction, snapshots off).
func ParseAttemptRules(raw json.RawMessage) AttemptRules {
	var source struct {
		DisablePaste      *bool `json:"disable_paste"`
		RestrictMobile    *bool `json:"restrict_mobile"`
		ScreenSwitchLimit *int  `json:"screen_switch_limit"`
		SnapshotInterval  *int  `json:"snapshot_interval"`
	}
	_ = json.Unmarshal(raw, &source)
	rules := AttemptRules{ScreenSwitchLimit: 5}
	if source.ScreenSwitchLimit != nil && *source.ScreenSwitchLimit >= 0 {
		rules.ScreenSwitchLimit = *source.ScreenSwitchLimit
	}
	if source.SnapshotInterval != nil && *source.SnapshotInterval >= 0 {
		rules.SnapshotInterval = *source.SnapshotInterval
	}
	rules.DisablePaste = source.DisablePaste != nil && *source.DisablePaste
	rules.RestrictMobile = source.RestrictMobile != nil && *source.RestrictMobile
	return rules
}

type SubmitResult struct {
	AttemptID     string    `json:"attempt_id"`
	Status        string    `json:"status"`
	TotalScore    *float64  `json:"total_score"`
	ScoreVisible  bool      `json:"score_visible"`
	PendingReview int       `json:"pending_review"`
	SubmittedAt   time.Time `json:"submitted_at"`
}

type attemptRow struct {
	ID              string
	ExamID          string
	ExamTitle       string
	UserID          string
	UserName        string
	Status          string
	PaperGroup      string
	StartedAt       time.Time
	SubmittedAt     *time.Time
	Score           *float64
	StartAt         time.Time
	EndAt           time.Time
	DurationMinutes int
	Rules           json.RawMessage
}

func loadAttempt(ctx context.Context, db DBTX, attemptID string, forUpdate bool) (attemptRow, error) {
	clause := ""
	if forUpdate {
		clause = ` FOR UPDATE OF a`
	}
	return loadAttemptWithLock(ctx, db, attemptID, clause)
}

// loadAttemptWithLock takes an explicit row lock clause ("FOR UPDATE OF a" or
// "FOR SHARE OF a"). Answer saves use a share lock: it serialises against SubmitAttempt
// (which holds FOR UPDATE) without letting two saves block each other.
func loadAttemptWithLock(ctx context.Context, db DBTX, attemptID, clause string) (attemptRow, error) {
	query := `
		SELECT a.id::text, a.exam_id::text, e.title, a.user_id::text, u.name, a.status, a.paper_group,
			a.started_at, a.submitted_at, a.score::float8, e.start_at, e.end_at, e.duration_minutes, e.rules
		FROM attempts a
		JOIN exams e ON e.id = a.exam_id
		JOIN users u ON u.id = a.user_id
		WHERE a.id = $1` + clause
	var row attemptRow
	err := db.QueryRow(ctx, query, attemptID).Scan(
		&row.ID, &row.ExamID, &row.ExamTitle, &row.UserID, &row.UserName, &row.Status, &row.PaperGroup,
		&row.StartedAt, &row.SubmittedAt, &row.Score, &row.StartAt, &row.EndAt, &row.DurationMinutes, &row.Rules,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return attemptRow{}, ErrNotFound
		}
		return attemptRow{}, fmt.Errorf("load attempt: %w", err)
	}
	return row, nil
}

func attemptDeadline(startedAt time.Time, durationMinutes int, endAt time.Time) time.Time {
	deadline := startedAt.Add(time.Duration(durationMinutes) * time.Minute)
	if deadline.After(endAt) {
		return endAt
	}
	return deadline
}

func (s *Store) StartAttempt(ctx context.Context, orgID, userID, examID string) (string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("begin start attempt: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Same order as the expiry sweep (exams before exam_candidates) so starting an exam
	// at the exact end_at cannot deadlock against the sweep marking candidates absent.
	if _, err := tx.Exec(ctx, `SELECT 1 FROM exams WHERE id = $1::uuid AND org_id = $2::uuid FOR UPDATE`, examID, orgID); err != nil {
		return "", fmt.Errorf("lock exam for start: %w", err)
	}

	var (
		examStatus      string
		candidateStatus string
		paperGroup      string
		startAt         time.Time
		endAt           time.Time
		duration        int
		attemptID       *string
		userName        string
	)
	err = tx.QueryRow(ctx, `
		SELECT e.status, ec.status, ec.paper_group, e.start_at, e.end_at, e.duration_minutes,
			ec.attempt_id::text, u.name
		FROM exams e
		JOIN exam_candidates ec ON ec.exam_id = e.id AND ec.user_id = $2
		JOIN users u ON u.id = $2
		WHERE e.id = $1 AND e.org_id = $3
		FOR UPDATE OF ec`, examID, userID, orgID,
	).Scan(&examStatus, &candidateStatus, &paperGroup, &startAt, &endAt, &duration, &attemptID, &userName)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrNotFound
		}
		return "", fmt.Errorf("load exam candidate: %w", err)
	}

	now := time.Now()
	switch examStatus {
	case "draft", "pending_publish":
		return "", ErrInvalidState
	case "ended", "grading", "pending_publish_score", "published", "archived":
		return "", ErrExpired
	}
	if now.Before(startAt) {
		return "", ErrTooEarly
	}
	if now.After(endAt) {
		return "", ErrExpired
	}
	if attemptID != nil {
		return *attemptID, nil
	}
	if candidateStatus == "absent" {
		return "", ErrInvalidState
	}

	var snapshotPayload []byte
	err = tx.QueryRow(ctx, `SELECT payload FROM paper_snapshots WHERE exam_id = $1`, examID).Scan(&snapshotPayload)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrInvalidState
	}
	if err != nil {
		return "", fmt.Errorf("load exam snapshot: %w", err)
	}
	var snapshot PaperSnapshot
	if err := json.Unmarshal(snapshotPayload, &snapshot); err != nil {
		return "", fmt.Errorf("parse exam snapshot: %w", err)
	}
	if snapshot.TotalFor(paperGroup) <= 0 {
		return "", fmt.Errorf("exam paper has no questions for group %s: %w", paperGroup, ErrInvalidState)
	}

	insertedID := ""
	err = tx.QueryRow(ctx, `
		INSERT INTO attempts (exam_id, user_id, started_at, status, paper_group)
		VALUES ($1, $2, $3, 'in_progress', $4)
		ON CONFLICT (exam_id, user_id) DO NOTHING
		RETURNING id::text`, examID, userID, now, paperGroup,
	).Scan(&insertedID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("insert attempt: %w", err)
	}
	if insertedID == "" {
		if err := tx.QueryRow(ctx, `SELECT id::text FROM attempts WHERE exam_id = $1 AND user_id = $2`, examID, userID).Scan(&insertedID); err != nil {
			return "", fmt.Errorf("load existing attempt: %w", err)
		}
	}

	if _, err := tx.Exec(ctx, `
		UPDATE exam_candidates SET status = 'testing', attempt_id = $1
		WHERE exam_id = $2 AND user_id = $3`, insertedID, examID, userID); err != nil {
		return "", fmt.Errorf("mark candidate testing: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE exams SET status = 'in_progress'
		WHERE id = $1 AND status = 'pending_start'`, examID); err != nil {
		return "", fmt.Errorf("mark exam in progress: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("commit start attempt: %w", err)
	}
	s.emit(RealtimeEvent{
		Type:      EventAttemptStarted,
		ExamID:    examID,
		AttemptID: insertedID,
		UserID:    userID,
		UserName:  userName,
		Detail:    map[string]any{"paper_group": paperGroup},
	})
	return insertedID, nil
}

func (s *Store) GetAttemptState(ctx context.Context, userID, attemptID string) (AttemptState, error) {
	row, err := loadAttempt(ctx, s.pool, attemptID, false)
	if err != nil {
		return AttemptState{}, err
	}
	if row.UserID != userID {
		return AttemptState{}, ErrForbidden
	}
	snapshot, err := s.GetSnapshot(ctx, row.ExamID)
	if err != nil {
		return AttemptState{}, err
	}

	now := time.Now()
	deadline := attemptDeadline(row.StartedAt, row.DurationMinutes, row.EndAt)
	remaining := int(deadline.Sub(now).Seconds())
	if remaining < 0 {
		remaining = 0
	}
	state := AttemptState{
		AttemptID:        row.ID,
		ExamID:           row.ExamID,
		ExamTitle:        row.ExamTitle,
		Status:           row.Status,
		PaperGroup:       row.PaperGroup,
		StartedAt:        row.StartedAt,
		Deadline:         deadline,
		ServerTime:       now,
		RemainingSeconds: remaining,
		Questions:        []AttemptQuestion{},
		Score:            row.Score,
		Rules:            ParseAttemptRules(row.Rules),
	}
	state.TotalScore = snapshot.TotalFor(row.PaperGroup)
	if !showScore(row.Rules) && row.Status != "published" {
		state.Score = nil
	}

	if row.Status == "in_progress" {
		answers := make(map[string]struct {
			Content json.RawMessage
			Version int
		})
		rows, err := s.pool.Query(ctx, `SELECT question_id::text, content, version FROM answers WHERE attempt_id = $1`, attemptID)
		if err != nil {
			return AttemptState{}, fmt.Errorf("load attempt answers: %w", err)
		}
		for rows.Next() {
			var questionID string
			var content json.RawMessage
			var version int
			if err := rows.Scan(&questionID, &content, &version); err != nil {
				rows.Close()
				return AttemptState{}, fmt.Errorf("scan attempt answer: %w", err)
			}
			answers[questionID] = struct {
				Content json.RawMessage
				Version int
			}{Content: content, Version: version}
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return AttemptState{}, fmt.Errorf("iterate attempt answers: %w", err)
		}
		rows.Close()

		groupQuestions := make([]SnapshotQuestion, 0, len(snapshot.Questions))
		for _, question := range snapshot.Questions {
			if question.PaperGroup == row.PaperGroup {
				groupQuestions = append(groupQuestions, question)
			}
		}
		// P-03 稳定随机卷：随机卷按「场次+考生」种子派生确定性题序，
		// 刷新、断线重连后顺序不变；固定卷/AB 卷保持快照原序。
		if snapshot.PaperType == "random" && len(groupQuestions) > 1 {
			order := seededOrder(row.ExamID, row.UserID, len(groupQuestions))
			shuffled := make([]SnapshotQuestion, len(groupQuestions))
			for pos, idx := range order {
				shuffled[pos] = groupQuestions[idx]
			}
			groupQuestions = shuffled
		}
		for _, question := range groupQuestions {
			answer := answers[question.QuestionID]
			content := answer.Content
			if len(content) == 0 {
				content = json.RawMessage(`{}`)
			}
			state.Questions = append(state.Questions, AttemptQuestion{
				QuestionID:     question.QuestionID,
				Type:           question.Type,
				Section:        question.Section,
				PaperGroup:     question.PaperGroup,
				Difficulty:     question.Difficulty,
				KnowledgePoint: question.KnowledgePoint,
				Content:        sanitizeQuestionContent(question),
				Score:          question.Score,
				SavedAnswer:    content,
				AnswerVersion:  answer.Version,
			})
		}
	}

	if err := s.pool.QueryRow(ctx, `
		SELECT count(*) FROM review_tasks
		WHERE attempt_id = $1 AND status IN ('pending', 'in_progress')`, attemptID,
	).Scan(&state.PendingReview); err != nil {
		return AttemptState{}, fmt.Errorf("count pending review tasks: %w", err)
	}
	return state, nil
}

func (s *Store) SaveAnswer(ctx context.Context, userID, attemptID, questionID string, content json.RawMessage, version int) (int, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("begin save answer: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// FOR SHARE conflicts with the FOR UPDATE taken by SubmitAttempt. Without it a save
	// racing the submission could return 200 and still be ignored by the graded score.
	row, err := loadAttemptWithLock(ctx, tx, attemptID, ` FOR SHARE OF a`)
	if err != nil {
		return 0, err
	}
	if row.UserID != userID {
		return 0, ErrForbidden
	}
	if row.Status != "in_progress" {
		return 0, ErrInvalidState
	}
	if time.Now().After(attemptDeadline(row.StartedAt, row.DurationMinutes, row.EndAt)) {
		return 0, ErrExpired
	}

	snapshot, err := s.GetSnapshot(ctx, row.ExamID)
	if err != nil {
		return 0, err
	}
	found := false
	for _, question := range snapshot.Questions {
		if question.QuestionID == questionID && question.PaperGroup == row.PaperGroup {
			found = true
			break
		}
	}
	if !found {
		return 0, ErrNotFound
	}

	savedVersion := version + 1
	if version <= 0 {
		tag, err := tx.Exec(ctx, `
			INSERT INTO answers (attempt_id, question_id, content, version, updated_at)
			VALUES ($1, $2, $3::jsonb, 1, now())
			ON CONFLICT (attempt_id, question_id) DO NOTHING`, attemptID, questionID, string(content))
		if err != nil {
			return 0, fmt.Errorf("insert answer: %w", err)
		}
		if tag.RowsAffected() == 0 {
			return 0, ErrConflict
		}
	} else {
		tag, err := tx.Exec(ctx, `
			UPDATE answers
			SET content = $1::jsonb, version = version + 1, updated_at = now()
			WHERE attempt_id = $2 AND question_id = $3 AND version = $4`,
			string(content), attemptID, questionID, version)
		if err != nil {
			return 0, fmt.Errorf("update answer: %w", err)
		}
		if tag.RowsAffected() == 0 {
			return 0, ErrConflict
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit save answer: %w", err)
	}
	return savedVersion, nil
}

func (s *Store) SubmitAttempt(ctx context.Context, userID, attemptID string) (SubmitResult, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return SubmitResult{}, fmt.Errorf("begin submit attempt: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	row, err := loadAttempt(ctx, tx, attemptID, true)
	if err != nil {
		return SubmitResult{}, err
	}
	if row.UserID != userID {
		return SubmitResult{}, ErrForbidden
	}

	if row.Status == "submitted" || row.Status == "graded" || row.Status == "published" {
		return s.existingSubmitResult(ctx, tx, row)
	}
	if row.Status != "in_progress" {
		return SubmitResult{}, ErrInvalidState
	}
	// Lock the exam before the candidate rows below. The expiry sweep takes exams first
	// and then exam_candidates; submitting in the opposite order deadlocked whenever the
	// last candidate submitted right at end_at.
	var lockedExamStatus string
	if err := tx.QueryRow(ctx, `SELECT status FROM exams WHERE id = $1::uuid FOR UPDATE`, row.ExamID).
		Scan(&lockedExamStatus); err != nil {
		return SubmitResult{}, fmt.Errorf("lock exam for submit: %w", err)
	}

	var payload []byte
	if err := tx.QueryRow(ctx, `SELECT payload FROM paper_snapshots WHERE exam_id = $1`, row.ExamID).Scan(&payload); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return SubmitResult{}, ErrInvalidState
		}
		return SubmitResult{}, fmt.Errorf("load snapshot for submit: %w", err)
	}
	var snapshot PaperSnapshot
	if err := json.Unmarshal(payload, &snapshot); err != nil {
		return SubmitResult{}, fmt.Errorf("parse snapshot for submit: %w", err)
	}

	answers := make(map[string]json.RawMessage)
	answerRows, err := tx.Query(ctx, `SELECT question_id::text, content FROM answers WHERE attempt_id = $1`, attemptID)
	if err != nil {
		return SubmitResult{}, fmt.Errorf("load answers for submit: %w", err)
	}
	for answerRows.Next() {
		var questionID string
		var content json.RawMessage
		if err := answerRows.Scan(&questionID, &content); err != nil {
			answerRows.Close()
			return SubmitResult{}, fmt.Errorf("scan answer for submit: %w", err)
		}
		answers[questionID] = content
	}
	if err := answerRows.Err(); err != nil {
		answerRows.Close()
		return SubmitResult{}, fmt.Errorf("iterate answers for submit: %w", err)
	}
	answerRows.Close()

	detail := ScoreDetail{Questions: []ScoreDetailItem{}}
	needsReview := make([]SnapshotQuestion, 0)
	total := 0.0
	for _, question := range snapshot.Questions {
		if question.PaperGroup != row.PaperGroup {
			continue
		}
		answer := answers[question.QuestionID]
		if len(answer) == 0 {
			answer = json.RawMessage(`{}`)
		}
		grade := grading.Grade(question.Type, question.Score, question.ScoreRule, question.Answer, answer)
		detail.Questions = append(detail.Questions, ScoreDetailItem{
			QuestionID:  question.QuestionID,
			Type:        question.Type,
			Score:       grade.Score,
			MaxScore:    question.Score,
			NeedsReview: grade.NeedsReview,
			Auto:        grade.Graded && !grade.NeedsReview,
		})
		total += grade.Score
		if grade.NeedsReview {
			needsReview = append(needsReview, question)
		}
	}
	if len(detail.Questions) == 0 {
		return SubmitResult{}, ErrInvalidState
	}

	detailRaw, err := json.Marshal(detail)
	if err != nil {
		return SubmitResult{}, fmt.Errorf("marshal score detail: %w", err)
	}
	total = round2(total)
	now := time.Now()
	if _, err := tx.Exec(ctx, `
		INSERT INTO score_records (attempt_id, total, detail, status)
		VALUES ($1, $2, $3::jsonb, 'pending')`, attemptID, total, string(detailRaw)); err != nil {
		return SubmitResult{}, fmt.Errorf("insert score record: %w", err)
	}

	newStatus := "graded"
	if len(needsReview) > 0 {
		newStatus = "submitted"
	}
	if _, err := tx.Exec(ctx, `
		UPDATE attempts SET submitted_at = $1, score = $2, status = $3
		WHERE id = $4`, now, total, newStatus, attemptID); err != nil {
		return SubmitResult{}, fmt.Errorf("mark attempt submitted: %w", err)
	}
	for _, question := range needsReview {
		reviewerID, _ := pickReviewer(ctx, tx, row.ExamID, []string{})
		if _, err := tx.Exec(ctx, `
			INSERT INTO review_tasks (attempt_id, question_id, round, reviewer_id, status)
			VALUES ($1::uuid, $2::uuid, 1, NULLIF($3, '')::uuid, 'pending')
			ON CONFLICT (attempt_id, question_id, round) DO NOTHING`,
			attemptID, question.QuestionID, reviewerID); err != nil {
			return SubmitResult{}, fmt.Errorf("create review task: %w", err)
		}
	}
	if _, err := tx.Exec(ctx, `
		UPDATE exam_candidates SET status = 'submitted'
		WHERE exam_id = $1 AND user_id = $2`, row.ExamID, row.UserID); err != nil {
		return SubmitResult{}, fmt.Errorf("mark candidate submitted: %w", err)
	}
	var remaining int
	if err := tx.QueryRow(ctx, `
		SELECT count(*) FROM exam_candidates
		WHERE exam_id = $1 AND status NOT IN ('submitted', 'absent')`, row.ExamID).Scan(&remaining); err != nil {
		return SubmitResult{}, fmt.Errorf("count remaining candidates: %w", err)
	}
	examEnded := false
	if remaining == 0 {
		tag, err := tx.Exec(ctx, `
			UPDATE exams SET status = 'ended'
			WHERE id = $1 AND status IN ('in_progress', 'pending_start')`, row.ExamID)
		if err != nil {
			return SubmitResult{}, fmt.Errorf("mark exam ended: %w", err)
		}
		examEnded = tag.RowsAffected() > 0
	}
	if err := tx.Commit(ctx); err != nil {
		return SubmitResult{}, fmt.Errorf("commit submit attempt: %w", err)
	}
	s.emit(RealtimeEvent{
		Type:      EventAttemptSubmitted,
		ExamID:    row.ExamID,
		AttemptID: attemptID,
		UserID:    row.UserID,
		UserName:  row.UserName,
		Detail: map[string]any{
			"pending_review": len(needsReview),
			"auto_graded":    len(needsReview) == 0,
		},
	})
	if examEnded {
		s.emit(RealtimeEvent{
			Type:   EventExamClosed,
			ExamID: row.ExamID,
			Detail: map[string]any{"reason": "all_candidates_submitted"},
		})
	}
	visible := showScore(row.Rules)
	var publicScore *float64
	if visible {
		publicScore = &total
	}
	return SubmitResult{
		AttemptID:     attemptID,
		Status:        newStatus,
		TotalScore:    publicScore,
		ScoreVisible:  visible,
		PendingReview: len(needsReview),
		SubmittedAt:   now,
	}, nil
}

func (s *Store) existingSubmitResult(ctx context.Context, tx pgx.Tx, row attemptRow) (SubmitResult, error) {
	var total float64
	err := tx.QueryRow(ctx, `
		SELECT total::float8 FROM score_records
		WHERE attempt_id = $1 ORDER BY created_at DESC LIMIT 1`, row.ID).Scan(&total)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return SubmitResult{}, fmt.Errorf("load submitted score: %w", err)
	}
	var pending int
	if err := tx.QueryRow(ctx, `
		SELECT count(*) FROM review_tasks
		WHERE attempt_id = $1 AND status IN ('pending', 'in_progress')`, row.ID).Scan(&pending); err != nil {
		return SubmitResult{}, fmt.Errorf("count pending reviews: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return SubmitResult{}, fmt.Errorf("commit idempotent submit: %w", err)
	}
	submittedAt := time.Now()
	if row.SubmittedAt != nil {
		submittedAt = *row.SubmittedAt
	}
	visible := showScore(row.Rules)
	var publicScore *float64
	if visible {
		publicScore = &total
	}
	return SubmitResult{
		AttemptID:     row.ID,
		Status:        row.Status,
		TotalScore:    publicScore,
		ScoreVisible:  visible,
		PendingReview: pending,
		SubmittedAt:   submittedAt,
	}, nil
}

// FinalizeExpiredAttempts auto-submits in-progress attempts whose personal deadline
// has passed. It is safe to run concurrently: SubmitAttempt is idempotent.
func (s *Store) FinalizeExpiredAttempts(ctx context.Context) (int, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT a.id::text, a.user_id::text
		FROM attempts a
		JOIN exams e ON e.id = a.exam_id
		WHERE a.status = 'in_progress'
			AND LEAST(a.started_at + make_interval(mins => e.duration_minutes), e.end_at) <= now()
		LIMIT 200`)
	if err != nil {
		return 0, fmt.Errorf("find expired attempts: %w", err)
	}
	defer rows.Close()

	type expiredAttempt struct {
		AttemptID string
		UserID    string
	}
	expired := make([]expiredAttempt, 0)
	for rows.Next() {
		var item expiredAttempt
		if err := rows.Scan(&item.AttemptID, &item.UserID); err != nil {
			return 0, fmt.Errorf("scan expired attempt: %w", err)
		}
		expired = append(expired, item)
	}
	if err := rows.Err(); err != nil {
		return 0, fmt.Errorf("iterate expired attempts: %w", err)
	}
	rows.Close()

	finalized := 0
	var firstErr error
	for _, item := range expired {
		if _, err := s.SubmitAttempt(ctx, item.UserID, item.AttemptID); err != nil {
			if firstErr == nil {
				firstErr = fmt.Errorf("finalize attempt %s: %w", item.AttemptID, err)
			}
			continue
		}
		finalized++
	}
	return finalized, firstErr
}

func showScore(rules json.RawMessage) bool {
	var parsed struct {
		ShowScore *bool `json:"show_score"`
	}
	if err := json.Unmarshal(rules, &parsed); err != nil || parsed.ShowScore == nil {
		return true
	}
	return *parsed.ShowScore
}

// seededOrder 按「场次+考生」种子派生确定性的题序（P-03 稳定随机卷）。
// 同一对 (exam, user) 永远得到同一顺序：刷新、断线重连、重新进入都不会洗牌。
func seededOrder(examID, userID string, count int) []int {
	sum := sha256.Sum256([]byte(examID + ":" + userID))
	rng := rand.New(rand.NewSource(int64(binary.BigEndian.Uint64(sum[:8]))))
	order := make([]int, count)
	for i := range order {
		order[i] = i
	}
	for i := count - 1; i > 0; i-- {
		j := rng.Intn(i + 1)
		order[i], order[j] = order[j], order[i]
	}
	return order
}

func sanitizeQuestionContent(question SnapshotQuestion) json.RawMessage {	if question.Type != "programming" {
		return question.Content
	}
	var content map[string]any
	if err := json.Unmarshal(question.Content, &content); err != nil {
		return question.Content
	}
	cases, ok := content["cases"].([]any)
	if !ok {
		return question.Content
	}
	visible := make([]any, 0, len(cases))
	for _, item := range cases {
		if record, ok := item.(map[string]any); ok {
			if hidden, _ := record["hidden"].(bool); hidden {
				continue
			}
		}
		visible = append(visible, item)
	}
	content["cases"] = visible
	raw, err := json.Marshal(content)
	if err != nil {
		return question.Content
	}
	return raw
}
