package grading

import (
	"encoding/json"
	"math"
	"strings"
)

type Result struct {
	Score       float64
	MaxScore    float64
	Graded      bool
	NeedsReview bool
	Detail      map[string]any
}

type candidateAnswer struct {
	Value  string   `json:"value"`
	Values []string `json:"values"`
	Text   string   `json:"text"`
	Code   string   `json:"code"`
}

type correctAnswer struct {
	Correct    []string   `json:"correct"`
	Answers    [][]string `json:"answers"`
	IgnoreCase *bool      `json:"ignore_case"`
	TrimSpace  *bool      `json:"trim_space"`
}

type scoreRule struct {
	Partial string `json:"partial"`
}

func Grade(questionType string, maxScore float64, ruleRaw, correctRaw, answerRaw json.RawMessage) Result {
	result := Result{MaxScore: maxScore, Detail: map[string]any{}}

	switch questionType {
	case "single", "judge":
		return gradeSingle(result, correctRaw, answerRaw)
	case "multiple":
		return gradeMultiple(result, ruleRaw, correctRaw, answerRaw)
	case "fill":
		return gradeFill(result, correctRaw, answerRaw)
	case "short", "essay", "programming", "media":
		result.NeedsReview = true
		result.Detail["reason"] = "manual_review"
		return result
	default:
		result.NeedsReview = true
		result.Detail["reason"] = "unknown_question_type"
		return result
	}
}

func gradeSingle(result Result, correctRaw, answerRaw json.RawMessage) Result {
	var correct correctAnswer
	if err := json.Unmarshal(correctRaw, &correct); err != nil || len(correct.Correct) == 0 {
		result.NeedsReview = true
		result.Detail["reason"] = "invalid_correct_answer"
		return result
	}
	var answer candidateAnswer
	if err := json.Unmarshal(answerRaw, &answer); err != nil {
		result.NeedsReview = true
		result.Detail["reason"] = "invalid_answer"
		return result
	}
	value := answer.Value
	if value == "" && len(answer.Values) > 0 {
		value = answer.Values[0]
	}
	result.Graded = true
	result.Detail["correct"] = correct.Correct[0]
	result.Detail["selected"] = value
	if strings.TrimSpace(value) == strings.TrimSpace(correct.Correct[0]) {
		result.Score = result.MaxScore
	}
	return result
}

func gradeMultiple(result Result, ruleRaw, correctRaw, answerRaw json.RawMessage) Result {
	var correct correctAnswer
	if err := json.Unmarshal(correctRaw, &correct); err != nil || len(correct.Correct) == 0 {
		result.NeedsReview = true
		result.Detail["reason"] = "invalid_correct_answer"
		return result
	}
	var answer candidateAnswer
	if err := json.Unmarshal(answerRaw, &answer); err != nil {
		result.NeedsReview = true
		result.Detail["reason"] = "invalid_answer"
		return result
	}

	correctSet := make(map[string]struct{}, len(correct.Correct))
	for _, item := range correct.Correct {
		correctSet[item] = struct{}{}
	}
	selectedSet := make(map[string]struct{}, len(answer.Values))
	for _, item := range answer.Values {
		selectedSet[item] = struct{}{}
	}

	result.Graded = true
	result.Detail["correct"] = correct.Correct
	result.Detail["selected"] = answer.Values
	if len(selectedSet) == 0 {
		result.Detail["reason"] = "empty_answer"
		return result
	}

	for item := range selectedSet {
		if _, ok := correctSet[item]; !ok {
			result.Detail["reason"] = "wrong_selection"
			return result
		}
	}

	if len(selectedSet) == len(correctSet) {
		result.Score = result.MaxScore
		return result
	}

	var rule scoreRule
	_ = json.Unmarshal(ruleRaw, &rule)
	if rule.Partial == "ratio" {
		result.Score = round2(result.MaxScore * float64(len(selectedSet)) / float64(len(correctSet)))
		result.Detail["reason"] = "partial_ratio"
		return result
	}
	result.Detail["reason"] = "incomplete_selection"
	return result
}

func gradeFill(result Result, correctRaw, answerRaw json.RawMessage) Result {
	var correct correctAnswer
	if err := json.Unmarshal(correctRaw, &correct); err != nil || len(correct.Answers) == 0 {
		result.NeedsReview = true
		result.Detail["reason"] = "invalid_correct_answer"
		return result
	}
	var answer candidateAnswer
	if err := json.Unmarshal(answerRaw, &answer); err != nil {
		result.NeedsReview = true
		result.Detail["reason"] = "invalid_answer"
		return result
	}

	result.Graded = true
	result.Detail["blank_count"] = len(correct.Answers)
	if len(answer.Values) == 0 {
		result.Detail["reason"] = "empty_answer"
		return result
	}
	if len(answer.Values) != len(correct.Answers) {
		result.NeedsReview = true
		result.Detail["reason"] = "blank_count_mismatch"
		return result
	}

	ignoreCase := true
	trimSpace := true
	if correct.IgnoreCase != nil {
		ignoreCase = *correct.IgnoreCase
	}
	if correct.TrimSpace != nil {
		trimSpace = *correct.TrimSpace
	}

	for index, accepted := range correct.Answers {
		if !matchesAny(answer.Values[index], accepted, ignoreCase, trimSpace) {
			result.NeedsReview = true
			result.Detail["reason"] = "answer_mismatch"
			result.Detail["mismatch_index"] = index
			return result
		}
	}
	result.Score = result.MaxScore
	return result
}

func matchesAny(value string, accepted []string, ignoreCase, trimSpace bool) bool {
	normalized := normalize(value, ignoreCase, trimSpace)
	for _, candidate := range accepted {
		if normalized == normalize(candidate, ignoreCase, trimSpace) {
			return true
		}
	}
	return false
}

func normalize(value string, ignoreCase, trimSpace bool) string {
	if trimSpace {
		value = strings.Join(strings.Fields(value), " ")
	}
	if ignoreCase {
		value = strings.ToLower(value)
	}
	return value
}

func round2(value float64) float64 {
	return math.Round(value*100) / 100
}
