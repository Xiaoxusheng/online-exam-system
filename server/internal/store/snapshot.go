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
	PaperID     string             `json:"paper_id"`
	PaperTitle  string             `json:"paper_title"`
	PaperType   string             `json:"paper_type"`
	TotalScore  float64            `json:"total_score"`
	GroupTotals map[string]float64 `json:"group_totals,omitempty"`
	Questions   []SnapshotQuestion `json:"questions"`
}

// groupTotals returns the full score of every paper group. Snapshots written before
// group_totals existed derive it from the questions so historical AB exams report the
// score a candidate can actually reach instead of the A+B sum stored in TotalScore.
func (p PaperSnapshot) groupTotals() map[string]float64 {
	if len(p.GroupTotals) > 0 {
		return p.GroupTotals
	}
	totals := make(map[string]float64, 2)
	for _, question := range p.Questions {
		totals[question.PaperGroup] += question.Score
	}
	return totals
}

// TotalFor is the full score for one candidate group. A group missing from the paper
// yields 0, which callers treat as "this candidate has no questions".
func (p PaperSnapshot) TotalFor(group string) float64 {
	totals := p.groupTotals()
	if len(totals) == 0 {
		return p.TotalScore
	}
	return totals[group]
}

// DisplayTotal is the paper full score to show a person: the largest group total, since
// no candidate ever sees more than one group.
func (p PaperSnapshot) DisplayTotal() float64 {
	totals := p.groupTotals()
	if len(totals) == 0 {
		return p.TotalScore
	}
	highest := 0.0
	for _, total := range totals {
		if total > highest {
			highest = total
		}
	}
	return highest
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
