package store

import (
	"encoding/json"
	"fmt"
)

type SnapshotQuestion struct {
	QuestionID     string          `json:"question_id"`
	Type           string          `json:"type"`
	Section        string          `json:"section"`
	PaperGroup     string          `json:"paper_group"`
	Difficulty     string          `json:"difficulty"`
	KnowledgePoint string          `json:"knowledge_point"`
	Content        json.RawMessage `json:"content"`
	Answer         json.RawMessage `json:"answer"`
	ScoreRule      json.RawMessage `json:"score_rule"`
	Score          float64         `json:"score"`
}

type PaperSnapshot struct {
	PaperID    string             `json:"paper_id"`
	PaperTitle string             `json:"paper_title"`
	PaperType  string             `json:"paper_type"`
	TotalScore float64            `json:"total_score"`
	Questions  []SnapshotQuestion `json:"questions"`
}

type RandomSection struct {
	Name           string  `json:"name"`
	BankID         string  `json:"bank_id"`
	Type           string  `json:"type"`
	Difficulty     string  `json:"difficulty"`
	KnowledgePoint string  `json:"knowledge_point"`
	Count          int     `json:"count"`
	Score          float64 `json:"score"`
}

type RandomRules struct {
	Sections []RandomSection `json:"sections"`
}

func ParseRandomRules(raw json.RawMessage) (RandomRules, error) {
	var rules RandomRules
	if len(raw) == 0 {
		return rules, fmt.Errorf("random rules are empty")
	}
	if err := json.Unmarshal(raw, &rules); err != nil {
		return rules, fmt.Errorf("parse random rules: %w", err)
	}
	if len(rules.Sections) == 0 {
		return rules, fmt.Errorf("random rules require at least one section")
	}
	for _, section := range rules.Sections {
		if section.Count <= 0 || section.Score <= 0 {
			return rules, fmt.Errorf("section %q requires positive count and score", section.Name)
		}
		if section.Type == "" {
			return rules, fmt.Errorf("section %q requires a question type", section.Name)
		}
	}
	return rules, nil
}
