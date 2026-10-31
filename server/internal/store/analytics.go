package store

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"
)

// ItemOption is one choice of a question and how many candidates picked it.
type ItemOption struct {
	Key     string `json:"key"`
	Count   int64  `json:"count"`
	Correct bool   `json:"correct"`
}

// ItemAnalysis is the per-question diagnosis of one exam.
type ItemAnalysis struct {
	QuestionID     string       `json:"question_id"`
	Type           string       `json:"type"`
	Stem           string       `json:"stem"`
	KnowledgePoint string       `json:"knowledge_point"`
	Difficulty     string       `json:"difficulty"`
	MaxScore       float64      `json:"max_score"`
	Answered       int64        `json:"answered"`
	Skipped        int64        `json:"skipped"`
	Correct        int64        `json:"correct"`
	CorrectRate    float64      `json:"correct_rate"`
	ScoreRate      float64      `json:"score_rate"`
	Discrimination float64      `json:"discrimination"`
	Subjective     bool         `json:"subjective"`
	Options        []ItemOption `json:"options"`
}

type ExamItemAnalytics struct {
	ExamID       string         `json:"exam_id"`
	ExamTitle    string         `json:"exam_title"`
	Participants int64          `json:"participants"`
	SampleNote   string         `json:"sample_note"`
	Items        []ItemAnalysis `json:"items"`
}

type itemAccumulator struct {
	item      ItemAnalysis
	highSum   float64
	lowSum    float64
	highCount int
	lowCount  int
	sum       float64
	optionSet map[string]bool
	options   map[string]int64
}

type itemMetadata struct {
	Type           string
	Stem           string
	KnowledgePoint string
	Difficulty     string
	Correct        []string
	OptionKeys     []string
}

type attemptScoreDetail struct {
	attemptID string
	total     float64
	detail    ScoreDetail
}

// GetExamItemAnalytics rebuilds per-question statistics for one exam.
// Correctness comes from the stored score detail, option picks from the raw answers, and the
// discrimination index compares the top and bottom 27% of candidates ranked by total score.
func (s *Store) GetExamItemAnalytics(ctx context.Context, scope Scope, examID string) (ExamItemAnalytics, error) {
	scopeSQL, scopeArgs := scope.peopleFilter("u", 3)
	args := append([]any{examID, scope.OrgID}, scopeArgs...)

	rows, err := s.pool.Query(ctx, `
		WITH latest AS (
			SELECT DISTINCT ON (attempt_id) attempt_id, total, detail
			FROM score_records
			ORDER BY attempt_id, created_at DESC
		)
		SELECT e.title, a.id::text, l.total::float8, l.detail
		FROM attempts a
		JOIN exams e ON e.id = a.exam_id
		JOIN users u ON u.id = a.user_id
		JOIN latest l ON l.attempt_id = a.id
		WHERE a.exam_id = $1::uuid AND e.org_id = $2 AND a.status IN ('graded', 'published')`+scopeSQL+`
		ORDER BY l.total DESC`, args...)
	if err != nil {
		return ExamItemAnalytics{}, fmt.Errorf("load item attempts: %w", err)
	}

	attempts := make([]attemptScoreDetail, 0, 32)
	var examTitle string
	for rows.Next() {
		var (
			item      attemptScoreDetail
			detailRaw []byte
		)
		if err := rows.Scan(&examTitle, &item.attemptID, &item.total, &detailRaw); err != nil {
			rows.Close()
			return ExamItemAnalytics{}, fmt.Errorf("scan item attempt: %w", err)
		}
		_ = json.Unmarshal(detailRaw, &item.detail)
		attempts = append(attempts, item)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return ExamItemAnalytics{}, fmt.Errorf("iterate item attempts: %w", err)
	}

	if len(attempts) == 0 {
		var exists bool
		if err := s.pool.QueryRow(ctx, `
			SELECT EXISTS(SELECT 1 FROM exams WHERE id = $1::uuid AND org_id = $2)`, examID, scope.OrgID).
			Scan(&exists); err != nil {
			return ExamItemAnalytics{}, fmt.Errorf("check exam for item analytics: %w", err)
		}
		if !exists {
			return ExamItemAnalytics{}, ErrNotFound
		}
		return ExamItemAnalytics{ExamID: examID, Items: []ItemAnalysis{}, SampleNote: "还没有已判分的答卷，无法统计题目分析"}, nil
	}

	questionIDs := make([]string, 0, 16)
	for _, attempt := range attempts {
		for _, question := range attempt.detail.Questions {
			questionIDs = append(questionIDs, question.QuestionID)
		}
	}
	metadata, err := s.loadItemMetadata(ctx, dedupeStrings(questionIDs))
	if err != nil {
		return ExamItemAnalytics{}, err
	}
	answers, err := s.loadAttemptAnswers(ctx, examID)
	if err != nil {
		return ExamItemAnalytics{}, err
	}

	accumulators := make(map[string]*itemAccumulator)
	order := make([]string, 0, 16)
	for _, attempt := range attempts {
		for _, question := range attempt.detail.Questions {
			acc := accumulators[question.QuestionID]
			if acc == nil {
				meta := metadata[question.QuestionID]
				acc = &itemAccumulator{
					item: ItemAnalysis{
						QuestionID: question.QuestionID, Type: meta.Type, Stem: meta.Stem,
						KnowledgePoint: meta.KnowledgePoint,
						Difficulty:     meta.Difficulty, MaxScore: question.MaxScore,
						Subjective: question.NeedsReview || !question.Auto,
					},
					optionSet: meta.correctSet(),
					options:   map[string]int64{},
				}
				for _, key := range meta.OptionKeys {
					acc.options[key] = 0
				}
				accumulators[question.QuestionID] = acc
				order = append(order, question.QuestionID)
			}
			acc.sum += question.Score
			if !acc.item.Subjective && question.MaxScore > 0 && question.Score >= question.MaxScore {
				acc.item.Correct++
			}
			if raw := answers[attempt.attemptID][question.QuestionID]; len(raw) > 0 {
				acc.item.Answered++
				acc.registerPicks(raw)
			} else {
				acc.item.Skipped++
			}
		}
	}

	group := int(math.Ceil(float64(len(attempts)) * 0.27))
	if group < 1 {
		group = 1
	}
	for index, attempt := range attempts {
		for _, question := range attempt.detail.Questions {
			acc := accumulators[question.QuestionID]
			if acc == nil {
				continue
			}
			switch {
			case index < group:
				acc.highCount++
				acc.highSum += question.Score
			case index >= len(attempts)-group:
				acc.lowCount++
				acc.lowSum += question.Score
			}
		}
	}

	participants := int64(len(attempts))
	items := make([]ItemAnalysis, 0, len(order))
	for _, questionID := range order {
		acc := accumulators[questionID]
		item := acc.item
		item.CorrectRate = percent(float64(item.Correct), float64(participants))
		item.ScoreRate = percent(acc.sum, float64(participants)*item.MaxScore)
		if acc.highCount > 0 && acc.lowCount > 0 && item.MaxScore > 0 {
			high := acc.highSum / float64(acc.highCount) / item.MaxScore
			low := acc.lowSum / float64(acc.lowCount) / item.MaxScore
			item.Discrimination = round2((high - low) * 100)
		}
		keys := make([]string, 0, len(acc.options))
		for key := range acc.options {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			item.Options = append(item.Options, ItemOption{Key: key, Count: acc.options[key], Correct: acc.optionSet[key]})
		}
		if item.Options == nil {
			item.Options = []ItemOption{}
		}
		items = append(items, item)
	}

	result := ExamItemAnalytics{ExamID: examID, ExamTitle: examTitle, Participants: participants, Items: items}
	if participants < 10 {
		result.SampleNote = "样本不足 10 份，正确率与区分度仅作参考"
	}
	return result, nil
}

// registerPicks counts which options a candidate chose for objective questions.
func (acc *itemAccumulator) registerPicks(raw json.RawMessage) {
	var content struct {
		Value  string   `json:"value"`
		Values []string `json:"values"`
	}
	if err := json.Unmarshal(raw, &content); err != nil {
		return
	}
	picks := make([]string, 0, len(content.Values)+1)
	if content.Value != "" {
		picks = append(picks, content.Value)
	}
	picks = append(picks, content.Values...)
	for _, pick := range picks {
		pick = strings.TrimSpace(pick)
		if pick == "" {
			continue
		}
		acc.options[pick]++
	}
}

func (m itemMetadata) correctSet() map[string]bool {
	set := make(map[string]bool, len(m.Correct))
	for _, key := range m.Correct {
		set[strings.TrimSpace(key)] = true
	}
	return set
}

func (s *Store) loadItemMetadata(ctx context.Context, questionIDs []string) (map[string]itemMetadata, error) {
	if len(questionIDs) == 0 {
		return map[string]itemMetadata{}, nil
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id::text, type, trim(content->>'stem'), content, knowledge_point, difficulty, answer
		FROM questions WHERE id::text = ANY($1::text[])`, questionIDs)
	if err != nil {
		return nil, fmt.Errorf("load item metadata: %w", err)
	}
	defer rows.Close()

	out := make(map[string]itemMetadata, len(questionIDs))
	for rows.Next() {
		var (
			id         string
			meta       itemMetadata
			answerRaw  []byte
			contentRaw []byte
			stem       *string
			knowledge  *string
		)
		if err := rows.Scan(&id, &meta.Type, &stem, &contentRaw, &knowledge, &meta.Difficulty, &answerRaw); err != nil {
			return nil, fmt.Errorf("scan item metadata: %w", err)
		}
		meta.Stem = dereference(stem)
		meta.KnowledgePoint = dereference(knowledge)
		var payload struct {
			Correct []string `json:"correct"`
		}
		_ = json.Unmarshal(answerRaw, &payload)
		meta.Correct = payload.Correct
		switch meta.Type {
		case "single", "multiple":
			var content struct {
				Options []struct {
					Key string `json:"key"`
				} `json:"options"`
			}
			_ = json.Unmarshal(contentRaw, &content)
			for _, option := range content.Options {
				if option.Key != "" {
					meta.OptionKeys = append(meta.OptionKeys, option.Key)
				}
			}
		case "judge":
			meta.OptionKeys = []string{"true", "false"}
		}
		out[id] = meta
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate item metadata: %w", err)
	}
	return out, nil
}

func (s *Store) loadAttemptAnswers(ctx context.Context, examID string) (map[string]map[string]json.RawMessage, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT an.attempt_id::text, an.question_id::text, an.content
		FROM answers an
		JOIN attempts a ON a.id = an.attempt_id
		WHERE a.exam_id = $1::uuid`, examID)
	if err != nil {
		return nil, fmt.Errorf("load attempt answers: %w", err)
	}
	defer rows.Close()

	out := make(map[string]map[string]json.RawMessage)
	for rows.Next() {
		var attemptID, questionID string
		var content json.RawMessage
		if err := rows.Scan(&attemptID, &questionID, &content); err != nil {
			return nil, fmt.Errorf("scan answer: %w", err)
		}
		bucket := out[attemptID]
		if bucket == nil {
			bucket = make(map[string]json.RawMessage)
			out[attemptID] = bucket
		}
		bucket[questionID] = content
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate answers: %w", err)
	}
	return out, nil
}

// KnowledgePointStat is the mastery level of one knowledge point.
type KnowledgePointStat struct {
	Name        string           `json:"name"`
	Items       int64            `json:"items"`
	Answers     int64            `json:"answers"`
	Correct     int64            `json:"correct"`
	ScoreRate   float64          `json:"score_rate"`
	CorrectRate float64          `json:"correct_rate"`
	Level       string           `json:"level"`
	Trend       []KnowledgeTrend `json:"trend"`
}

type KnowledgeTrend struct {
	ExamID    string  `json:"exam_id"`
	ExamTitle string  `json:"exam_title"`
	ScoreRate float64 `json:"score_rate"`
	Answers   int64   `json:"answers"`
}

type KnowledgeAnalytics struct {
	Scope        string               `json:"scope"`
	Exams        int64                `json:"exams"`
	Participants int64                `json:"participants"`
	Points       []KnowledgePointStat `json:"points"`
}

// GetKnowledgeAnalytics aggregates score rates per knowledge point, either for one exam
// or across every exam the caller can see.
func (s *Store) GetKnowledgeAnalytics(ctx context.Context, scope Scope, examID string) (KnowledgeAnalytics, error) {
	scopeSQL, scopeArgs := scope.peopleFilter("u", 2)
	args := []any{scope.OrgID}
	where := []string{"e.org_id = $1", "a.status IN ('graded', 'published')" + scopeSQL}
	args = append(args, scopeArgs...)
	if examID != "" {
		args = append(args, examID)
		where = append(where, fmt.Sprintf("a.exam_id = $%d::uuid", len(args)))
	}

	// One pass over the score details, two grouping levels: the knowledge point overall and
	// per exam (the per-exam rows form the trend series).
	rows, err := s.pool.Query(ctx, `
		WITH latest AS (
			SELECT DISTINCT ON (attempt_id) attempt_id, detail
			FROM score_records
			ORDER BY attempt_id, created_at DESC
		),
		picked AS (
			SELECT e.id::text AS exam_id, e.title AS exam_title, a.id::text AS attempt_id,
				(dq->>'question_id') AS question_id,
				COALESCE(NULLIF(q.knowledge_point, ''), '未分类') AS point,
				(dq->>'score')::numeric AS score,
				(dq->>'max_score')::numeric AS max_score,
				COALESCE((dq->>'needs_review')::boolean, false) AS needs_review
			FROM attempts a
			JOIN exams e ON e.id = a.exam_id
			JOIN users u ON u.id = a.user_id
			JOIN latest l ON l.attempt_id = a.id
			CROSS JOIN LATERAL jsonb_array_elements(l.detail -> 'questions') AS dq
			JOIN questions q ON q.id = (dq->>'question_id')::uuid
			WHERE `+strings.Join(where, " AND ")+`
		)
		SELECT point, exam_id, exam_title,
			count(DISTINCT question_id)::bigint,
			count(DISTINCT attempt_id)::bigint,
			count(*)::bigint,
			sum(score)::float8, sum(max_score)::float8,
			count(*) FILTER (WHERE NOT needs_review AND score = max_score)::bigint
		FROM picked
		GROUP BY GROUPING SETS ((point), (point, exam_id, exam_title))
		ORDER BY point, exam_title`, args...)
	if err != nil {
		return KnowledgeAnalytics{}, fmt.Errorf("load knowledge analytics: %w", err)
	}
	defer rows.Close()

	type pointAggregation struct {
		name     string
		items    int64
		attempts int64
		answers  int64
		correct  int64
		got      float64
		possible float64
		exams    map[string]bool
		trend    []KnowledgeTrend
	}
	byPoint := make(map[string]*pointAggregation)
	for rows.Next() {
		var (
			name         string
			rowExamID    *string
			rowExamTitle *string
			items        int64
			attempts     int64
			answers      int64
			got          float64
			possible     float64
			correct      int64
		)
		if err := rows.Scan(&name, &rowExamID, &rowExamTitle, &items, &attempts, &answers, &got, &possible, &correct); err != nil {
			return KnowledgeAnalytics{}, fmt.Errorf("scan knowledge point: %w", err)
		}
		aggregation := byPoint[name]
		if aggregation == nil {
			aggregation = &pointAggregation{name: name, exams: make(map[string]bool)}
			byPoint[name] = aggregation
		}
		if rowExamID == nil {
			aggregation.items = items
			aggregation.attempts = attempts
			continue
		}
		aggregation.answers += answers
		aggregation.correct += correct
		aggregation.got += got
		aggregation.possible += possible
		aggregation.exams[*rowExamID] = true
		aggregation.trend = append(aggregation.trend, KnowledgeTrend{
			ExamID: *rowExamID, ExamTitle: *rowExamTitle, Answers: answers, ScoreRate: percent(got, possible),
		})
	}
	if err := rows.Err(); err != nil {
		return KnowledgeAnalytics{}, fmt.Errorf("iterate knowledge points: %w", err)
	}

	names := make([]string, 0, len(byPoint))
	for name := range byPoint {
		names = append(names, name)
	}
	sort.Slice(names, func(i, j int) bool {
		left := percent(byPoint[names[i]].got, byPoint[names[i]].possible)
		right := percent(byPoint[names[j]].got, byPoint[names[j]].possible)
		if left == right {
			return names[i] < names[j]
		}
		return left > right
	})

	points := make([]KnowledgePointStat, 0, len(names))
	examSet := make(map[string]bool)
	participants := int64(0)
	for _, name := range names {
		aggregation := byPoint[name]
		rate := percent(aggregation.got, aggregation.possible)
		sort.Slice(aggregation.trend, func(i, j int) bool { return aggregation.trend[i].ExamTitle < aggregation.trend[j].ExamTitle })
		for examIDValue := range aggregation.exams {
			examSet[examIDValue] = true
		}
		if aggregation.attempts > participants {
			participants = aggregation.attempts
		}
		points = append(points, KnowledgePointStat{
			Name:        aggregation.name,
			Items:       aggregation.items,
			Answers:     aggregation.answers,
			Correct:     aggregation.correct,
			ScoreRate:   rate,
			CorrectRate: percent(float64(aggregation.correct), float64(aggregation.answers)),
			Level:       masteryLevel(rate),
			Trend:       aggregation.trend,
		})
	}

	result := KnowledgeAnalytics{Points: points, Exams: int64(len(examSet)), Participants: participants}
	if examID != "" {
		result.Scope = "exam"
	} else {
		result.Scope = "all"
	}
	return result, nil
}

func masteryLevel(rate float64) string {
	switch {
	case rate >= 85:
		return "优秀"
	case rate >= 70:
		return "良好"
	case rate >= 50:
		return "待巩固"
	default:
		return "待提升"
	}
}

func percent(part, whole float64) float64 {
	if whole <= 0 {
		return 0
	}
	return round2(part / whole * 100)
}

func dedupeStrings(values []string) []string {
	seen := make(map[string]bool, len(values))
	out := make([]string, 0, len(values))
	for _, value := range values {
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}

func dereference(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
