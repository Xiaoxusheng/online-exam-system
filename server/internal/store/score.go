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

type ScoreDetailItem struct {
	QuestionID  string  `json:"question_id"`
	Type        string  `json:"type"`
	Score       float64 `json:"score"`
	MaxScore    float64 `json:"max_score"`
	NeedsReview bool    `json:"needs_review"`
	Auto        bool    `json:"auto"`
}

type ScoreDetail struct {
	Questions []ScoreDetailItem `json:"questions"`
}

type ScoreListItem struct {
	AttemptID     string     `json:"attempt_id"`
	UserID        string     `json:"user_id"`
	UserName      string     `json:"user_name"`
	Username      string     `json:"username"`
	ExamID        string     `json:"exam_id"`
	ExamTitle     string     `json:"exam_title"`
	Total         float64    `json:"total"`
	ScoreStatus   string     `json:"score_status"`
	AttemptStatus string     `json:"attempt_status"`
	SubmittedAt   *time.Time `json:"submitted_at"`
	PublishedAt   *time.Time `json:"published_at"`
}

type ScoreRecordDetail struct {
	ScoreListItem
	Detail ScoreDetail `json:"detail"`
}

type MyScore struct {
	AttemptID   string     `json:"attempt_id"`
	ExamID      string     `json:"exam_id"`
	ExamTitle   string     `json:"exam_title"`
	Total       float64    `json:"total"`
	Status      string     `json:"status"`
	PublishedAt *time.Time `json:"published_at"`
}

type ScoreFilter struct {
	ExamID   string
	Status   string
	Keyword  string
	Page     int
	PageSize int
}

func (s *Store) ListScores(ctx context.Context, scope Scope, f ScoreFilter) ([]ScoreListItem, int64, error) {
	scopeSQL, scopeArgs := scope.peopleFilter("u", 2)
	where := []string{"e.org_id = $1" + scopeSQL, "a.status IN ('submitted', 'graded', 'published')"}
	args := append([]any{scope.OrgID}, scopeArgs...)
	if f.ExamID != "" {
		args = append(args, f.ExamID)
		where = append(where, fmt.Sprintf("e.id = $%d::uuid", len(args)))
	}
	if f.Status != "" {
		args = append(args, f.Status)
		where = append(where, fmt.Sprintf("sr.status = $%d", len(args)))
	}
	if f.Keyword != "" {
		args = append(args, "%"+f.Keyword+"%")
		n := len(args)
		where = append(where, fmt.Sprintf("(u.name ILIKE $%d OR u.username ILIKE $%d)", n, n))
	}
	whereSQL := strings.Join(where, " AND ")

	base := `
		FROM attempts a
		JOIN users u ON u.id = a.user_id
		JOIN exams e ON e.id = a.exam_id
		JOIN LATERAL (
			SELECT total, status, published_at, created_at FROM score_records
			WHERE attempt_id = a.id ORDER BY created_at DESC LIMIT 1
		) sr ON true
		WHERE ` + whereSQL

	var total int64
	if err := s.pool.QueryRow(ctx, `SELECT count(*) `+base, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count scores: %w", err)
	}

	args = append(args, f.PageSize, (f.Page-1)*f.PageSize)
	rows, err := s.pool.Query(ctx, `
		SELECT a.id::text, u.id::text, u.name, u.username, e.id::text, e.title,
			sr.total::float8, sr.status, a.status, a.submitted_at, sr.published_at
		`+base+`
		ORDER BY a.submitted_at DESC NULLS LAST
		LIMIT $`+fmt.Sprint(len(args)-1)+` OFFSET $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list scores: %w", err)
	}
	defer rows.Close()

	items := make([]ScoreListItem, 0, f.PageSize)
	for rows.Next() {
		var item ScoreListItem
		if err := rows.Scan(&item.AttemptID, &item.UserID, &item.UserName, &item.Username, &item.ExamID,
			&item.ExamTitle, &item.Total, &item.ScoreStatus, &item.AttemptStatus, &item.SubmittedAt, &item.PublishedAt); err != nil {
			return nil, 0, fmt.Errorf("scan score: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("iterate scores: %w", err)
	}
	return items, total, nil
}

// GetScoreRecord loads the latest score record of an attempt within the caller's scope.
// publishedOnly is used by the candidate route so unpublished scores stay invisible.
func (s *Store) GetScoreRecord(ctx context.Context, scope Scope, attemptID string, publishedOnly bool) (ScoreRecordDetail, error) {
	var item ScoreRecordDetail
	var detailRaw []byte
	scopeSQL, scopeArgs := scope.peopleFilter("u", 3)
	if publishedOnly {
		scopeSQL += " AND sr.status = 'published'"
	}
	args := append([]any{attemptID, scope.OrgID}, scopeArgs...)
	err := s.pool.QueryRow(ctx, `
		SELECT a.id::text, u.id::text, u.name, u.username, e.id::text, e.title,
			sr.total::float8, sr.status, a.status, a.submitted_at, sr.published_at, sr.detail
		FROM score_records sr
		JOIN attempts a ON a.id = sr.attempt_id
		JOIN users u ON u.id = a.user_id
		JOIN exams e ON e.id = a.exam_id
		WHERE sr.attempt_id = $1::uuid AND e.org_id = $2`+scopeSQL+`
		ORDER BY sr.created_at DESC
		LIMIT 1`, args...).Scan(&item.AttemptID, &item.UserID, &item.UserName, &item.Username, &item.ExamID, &item.ExamTitle,
		&item.Total, &item.ScoreStatus, &item.AttemptStatus, &item.SubmittedAt, &item.PublishedAt, &detailRaw)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ScoreRecordDetail{}, ErrNotFound
		}
		return ScoreRecordDetail{}, fmt.Errorf("get score record: %w", err)
	}
	if len(detailRaw) > 0 {
		if err := json.Unmarshal(detailRaw, &item.Detail); err != nil {
			return ScoreRecordDetail{}, fmt.Errorf("parse score detail: %w", err)
		}
	}
	if item.Detail.Questions == nil {
		item.Detail.Questions = []ScoreDetailItem{}
	}
	return item, nil
}

func (s *Store) PublishScores(ctx context.Context, orgID, examID string) (int64, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("begin publish scores: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var examStatus, examTitle string
	err = tx.QueryRow(ctx, `SELECT status, title FROM exams WHERE id = $1 AND org_id = $2 FOR UPDATE`, examID, orgID).
		Scan(&examStatus, &examTitle)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, ErrNotFound
		}
		return 0, fmt.Errorf("load exam for scores: %w", err)
	}
	if !validExamStatusForPublish(examStatus) {
		return 0, ErrInvalidState
	}

	type publishedScore struct {
		userID string
		total  float64
	}
	published := make([]publishedScore, 0)
	rows, err := tx.Query(ctx, `
		UPDATE score_records sr
		SET status = 'published', published_at = now()
		FROM attempts a
		WHERE sr.attempt_id = a.id
			AND a.exam_id = $1
			AND a.status = 'graded'
			AND sr.status = 'pending'
		RETURNING a.user_id::text, sr.total::float8`, examID)
	if err != nil {
		return 0, fmt.Errorf("publish score records: %w", err)
	}
	for rows.Next() {
		var item publishedScore
		if err := rows.Scan(&item.userID, &item.total); err != nil {
			rows.Close()
			return 0, fmt.Errorf("scan published score: %w", err)
		}
		published = append(published, item)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return 0, fmt.Errorf("iterate published scores: %w", err)
	}
	rows.Close()

	if len(published) == 0 {
		var alreadyPublished int64
		if err := tx.QueryRow(ctx, `
			SELECT count(*) FROM score_records sr
			JOIN attempts a ON a.id = sr.attempt_id
			WHERE a.exam_id = $1 AND a.status = 'published' AND sr.status = 'published'`, examID).Scan(&alreadyPublished); err != nil {
			return 0, fmt.Errorf("check published scores: %w", err)
		}
		if alreadyPublished == 0 {
			return 0, ErrInvalidState
		}
	}
	if _, err := tx.Exec(ctx, `
		UPDATE attempts SET status = 'published'
		WHERE exam_id = $1 AND status = 'graded'`, examID); err != nil {
		return 0, fmt.Errorf("mark attempts published: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE exams SET status = 'published'
		WHERE id = $1 AND org_id = $2`, examID, orgID); err != nil {
		return 0, fmt.Errorf("mark exam published: %w", err)
	}
	for _, item := range published {
		content := fmt.Sprintf("《%s》成绩已公布，得分 %.2f 分。", examTitle, item.total)
		if _, err := notifyUser(ctx, tx, orgID, item.userID, "成绩发布", content, "score_publish", examID); err != nil {
			return 0, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit publish scores: %w", err)
	}
	return int64(len(published)), nil
}

func validExamStatusForPublish(status string) bool {
	switch status {
	case "ended", "grading", "pending_publish_score", "published":
		return true
	default:
		return false
	}
}

func (s *Store) ListMyScores(ctx context.Context, orgID, userID string) ([]MyScore, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT a.id::text, e.id::text, e.title, sr.total::float8, sr.status, sr.published_at
		FROM attempts a
		JOIN exams e ON e.id = a.exam_id
		JOIN LATERAL (
			SELECT total, status, published_at FROM score_records
			WHERE attempt_id = a.id ORDER BY created_at DESC LIMIT 1
		) sr ON true
		WHERE a.user_id = $1 AND e.org_id = $2 AND sr.status = 'published'
		ORDER BY sr.published_at DESC NULLS LAST`, userID, orgID)
	if err != nil {
		return nil, fmt.Errorf("list my scores: %w", err)
	}
	defer rows.Close()

	scores := make([]MyScore, 0)
	for rows.Next() {
		var item MyScore
		if err := rows.Scan(&item.AttemptID, &item.ExamID, &item.ExamTitle, &item.Total, &item.Status, &item.PublishedAt); err != nil {
			return nil, fmt.Errorf("scan my score: %w", err)
		}
		scores = append(scores, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate my scores: %w", err)
	}
	return scores, nil
}

type ScoreBucket struct {
	Label string `json:"label"`
	Count int64  `json:"count"`
}

type ExamAnalytics struct {
	ExamID         string        `json:"exam_id"`
	ExamTitle      string        `json:"exam_title"`
	PaperTitle     string        `json:"paper_title"`
	TotalScore     float64       `json:"total_score"`
	PassScore      float64       `json:"pass_score"`
	CandidateCount int64         `json:"candidate_count"`
	GradedCount    int64         `json:"graded_count"`
	Average        float64       `json:"average"`
	Highest        float64       `json:"highest"`
	Lowest         float64       `json:"lowest"`
	PassRate       float64       `json:"pass_rate"`
	Distribution   []ScoreBucket `json:"distribution"`
}

func (s *Store) GetExamAnalytics(ctx context.Context, scope Scope, examID string) (ExamAnalytics, error) {
	var analytics ExamAnalytics
	var rulesRaw []byte
	candidateScope, candidateArgs := scope.peopleFilter("cu", 3)
	candidateSQL := `(SELECT count(*) FROM exam_candidates ec JOIN users cu ON cu.id = ec.user_id
		WHERE ec.exam_id = e.id` + candidateScope + `)`
	err := s.pool.QueryRow(ctx, `
		SELECT e.id::text, e.title, p.title, e.rules,
			`+candidateSQL+`
		FROM exams e JOIN papers p ON p.id = e.paper_id
		WHERE e.id = $1 AND e.org_id = $2`, append([]any{examID, scope.OrgID}, candidateArgs...)...,
	).Scan(&analytics.ExamID, &analytics.ExamTitle, &analytics.PaperTitle, &rulesRaw, &analytics.CandidateCount)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ExamAnalytics{}, ErrNotFound
		}
		return ExamAnalytics{}, fmt.Errorf("load exam analytics: %w", err)
	}

	snapshot, err := s.GetSnapshot(ctx, examID)
	if err != nil {
		return ExamAnalytics{}, err
	}
	analytics.TotalScore = snapshot.TotalScore

	var rules struct {
		PassScore float64 `json:"pass_score"`
	}
	_ = json.Unmarshal(rulesRaw, &rules)
	analytics.PassScore = rules.PassScore
	if analytics.PassScore <= 0 && analytics.TotalScore > 0 {
		analytics.PassScore = math.Round(analytics.TotalScore*0.6*100) / 100
	}

	scoreScope, scoreArgs := scope.peopleFilter("u", 2)
	rows, err := s.pool.Query(ctx, `
		SELECT sr.total::float8
		FROM score_records sr
		JOIN attempts a ON a.id = sr.attempt_id
		JOIN users u ON u.id = a.user_id
		WHERE a.exam_id = $1 AND a.status IN ('graded', 'published')`+scoreScope,
		append([]any{examID}, scoreArgs...)...)
	if err != nil {
		return ExamAnalytics{}, fmt.Errorf("load analytics scores: %w", err)
	}
	defer rows.Close()

	scores := make([]float64, 0)
	for rows.Next() {
		var score float64
		if err := rows.Scan(&score); err != nil {
			return ExamAnalytics{}, fmt.Errorf("scan analytics score: %w", err)
		}
		scores = append(scores, score)
	}
	if err := rows.Err(); err != nil {
		return ExamAnalytics{}, fmt.Errorf("iterate analytics scores: %w", err)
	}

	analytics.GradedCount = int64(len(scores))
	analytics.Distribution = []ScoreBucket{
		{Label: "0-59"}, {Label: "60-69"}, {Label: "70-79"}, {Label: "80-89"}, {Label: "90-100"},
	}
	if len(scores) == 0 {
		return analytics, nil
	}
	sum := 0.0
	passCount := 0
	for _, score := range scores {
		sum += score
		if score > analytics.Highest || analytics.Highest == 0 {
			analytics.Highest = score
		}
		if score < analytics.Lowest || analytics.Lowest == 0 {
			analytics.Lowest = score
		}
		if score >= analytics.PassScore {
			passCount++
		}
		percent := 0.0
		if analytics.TotalScore > 0 {
			percent = score / analytics.TotalScore * 100
		}
		switch {
		case percent < 60:
			analytics.Distribution[0].Count++
		case percent < 70:
			analytics.Distribution[1].Count++
		case percent < 80:
			analytics.Distribution[2].Count++
		case percent < 90:
			analytics.Distribution[3].Count++
		default:
			analytics.Distribution[4].Count++
		}
	}
	analytics.Average = round2(sum / float64(len(scores)))
	analytics.PassRate = round2(float64(passCount) / float64(len(scores)) * 100)
	return analytics, nil
}

func round2(value float64) float64 {
	return math.Round(value*100) / 100
}
