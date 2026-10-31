package grading

import (
	"encoding/json"
	"testing"
)

func raw(value string) json.RawMessage { return json.RawMessage(value) }

func TestGradeSingleChoice(t *testing.T) {
	correct := raw(`{"correct":["A"]}`)

	ok := Grade("single", 2, nil, correct, raw(`{"value":"A"}`))
	if !ok.Graded || ok.Score != 2 {
		t.Fatalf("expected full score for correct single choice: %+v", ok)
	}

	wrong := Grade("single", 2, nil, correct, raw(`{"value":"B"}`))
	if !wrong.Graded || wrong.Score != 0 {
		t.Fatalf("expected zero for wrong single choice: %+v", wrong)
	}

	empty := Grade("single", 2, nil, correct, raw(`{}`))
	if empty.Score != 0 || empty.NeedsReview {
		t.Fatalf("expected zero without review for empty answer: %+v", empty)
	}
}

func TestGradeMultipleChoice(t *testing.T) {
	rule := raw(`{"partial":"ratio"}`)
	correct := raw(`{"correct":["A","C"]}`)

	full := Grade("multiple", 4, rule, correct, raw(`{"values":["A","C"]}`))
	if full.Score != 4 {
		t.Fatalf("expected full score: %+v", full)
	}

	partial := Grade("multiple", 4, rule, correct, raw(`{"values":["A"]}`))
	if partial.Score != 2 {
		t.Fatalf("expected ratio partial score 2: %+v", partial)
	}

	wrong := Grade("multiple", 4, rule, correct, raw(`{"values":["A","B"]}`))
	if wrong.Score != 0 {
		t.Fatalf("expected zero when wrong option selected: %+v", wrong)
	}

	noPartial := Grade("multiple", 4, raw(`{"partial":"none"}`), correct, raw(`{"values":["A"]}`))
	if noPartial.Score != 0 {
		t.Fatalf("expected zero when partial scoring disabled: %+v", noPartial)
	}
}

func TestGradeJudge(t *testing.T) {
	correct := raw(`{"correct":["true"]}`)
	if got := Grade("judge", 1, nil, correct, raw(`{"value":"true"}`)); got.Score != 1 {
		t.Fatalf("expected judge true score: %+v", got)
	}
	if got := Grade("judge", 1, nil, correct, raw(`{"value":"false"}`)); got.Score != 0 {
		t.Fatalf("expected judge false score: %+v", got)
	}
}

func TestGradeFillNormalization(t *testing.T) {
	correct := raw(`{"answers":[["北京","Beijing"],["上海"]]}`)
	answer := raw(`{"values":[" beijing ","上海"]}`)
	got := Grade("fill", 4, nil, correct, answer)
	if got.Score != 4 || got.NeedsReview {
		t.Fatalf("expected normalized fill match: %+v", got)
	}

	mismatch := Grade("fill", 4, nil, correct, raw(`{"values":["广州","上海"]}`))
	if mismatch.Score != 0 || !mismatch.NeedsReview {
		t.Fatalf("expected mismatch to require review: %+v", mismatch)
	}
}

func TestGradeSubjectiveNeedsReview(t *testing.T) {
	for _, questionType := range []string{"short", "essay", "programming", "media"} {
		got := Grade(questionType, 10, nil, raw(`{}`), raw(`{"text":"answer"}`))
		if got.Score != 0 || !got.NeedsReview || got.Graded {
			t.Fatalf("expected manual review for %s: %+v", questionType, got)
		}
	}
}
