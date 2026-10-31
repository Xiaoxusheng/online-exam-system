package store

import (
	"encoding/json"
	"testing"
)

func TestParseReviewRules(t *testing.T) {
	cases := []struct {
		name       string
		rules      string
		wantMode   string
		wantGap    float64
		wantHasGap bool
	}{
		{name: "empty rules default to single", rules: `{}`, wantMode: "single", wantGap: 0, wantHasGap: false},
		{name: "invalid json defaults to single", rules: `not-json`, wantMode: "single", wantGap: 0, wantHasGap: false},
		{name: "double without threshold", rules: `{"review_mode":"double"}`, wantMode: "double", wantGap: 0, wantHasGap: false},
		{name: "double with threshold", rules: `{"review_mode":"double","review_threshold":1.5}`, wantMode: "double", wantGap: 1.5, wantHasGap: true},
		{name: "zero threshold falls back", rules: `{"review_mode":"double","review_threshold":0}`, wantMode: "double", wantGap: 0, wantHasGap: false},
		{name: "unknown mode falls back", rules: `{"review_mode":"duble"}`, wantMode: "single", wantGap: 0, wantHasGap: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := parseReviewRules(json.RawMessage(tc.rules))
			if got.Mode != tc.wantMode {
				t.Fatalf("mode = %q, want %q", got.Mode, tc.wantMode)
			}
			if got.HasConfiguredGap != tc.wantHasGap || got.ConfiguredGap != tc.wantGap {
				t.Fatalf("gap = %v/%v, want %v/%v", got.ConfiguredGap, got.HasConfiguredGap, tc.wantGap, tc.wantHasGap)
			}
		})
	}
}

func TestReviewRulesThresholdFor(t *testing.T) {
	single := parseReviewRules(json.RawMessage(`{}`))
	if got := single.thresholdFor(10); got != 2 {
		t.Fatalf("default threshold = %v, want 2 (20%% of 10)", got)
	}
	double := parseReviewRules(json.RawMessage(`{"review_mode":"double","review_threshold":0.5}`))
	if got := double.thresholdFor(10); got != 0.5 {
		t.Fatalf("configured threshold = %v, want 0.5", got)
	}
}
