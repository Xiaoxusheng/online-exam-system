package store

import (
	"encoding/json"
	"testing"
)

func TestSnapshotTotalForSplitsByPaperGroup(t *testing.T) {
	snapshot := PaperSnapshot{
		PaperType:  "ab",
		TotalScore: 60,
		Questions: []SnapshotQuestion{
			{PaperGroup: "A", Score: 30},
			{PaperGroup: "B", Score: 20},
			{PaperGroup: "B", Score: 10},
		},
	}
	if got := snapshot.TotalFor("A"); got != 30 {
		t.Errorf("TotalFor(A) = %v, want 30", got)
	}
	if got := snapshot.TotalFor("B"); got != 30 {
		t.Errorf("TotalFor(B) = %v, want 30", got)
	}
	if got := snapshot.TotalFor("C"); got != 0 {
		t.Errorf("TotalFor(unknown group) = %v, want 0", got)
	}
	if got := snapshot.DisplayTotal(); got != 30 {
		t.Errorf("DisplayTotal() = %v, want 30 (no candidate ever reaches the A+B sum)", got)
	}
}

// Snapshots written before group_totals existed only carry the summed TotalScore, so the
// per-group reach must be derived from the questions instead of trusting that field.
func TestSnapshotDerivesGroupTotalsForLegacyPayload(t *testing.T) {
	legacy := PaperSnapshot{
		PaperType:  "ab",
		TotalScore: 60,
		Questions: []SnapshotQuestion{
			{PaperGroup: "A", Score: 25},
			{PaperGroup: "B", Score: 35},
		},
	}
	if got := legacy.TotalFor("A"); got != 25 {
		t.Errorf("legacy TotalFor(A) = %v, want 25", got)
	}
	if got := legacy.TotalFor("B"); got != 35 {
		t.Errorf("legacy TotalFor(B) = %v, want 35", got)
	}
	if got := legacy.DisplayTotal(); got != 35 {
		t.Errorf("legacy DisplayTotal() = %v, want 35", got)
	}

	stored, err := json.Marshal(legacy)
	if err != nil {
		t.Fatalf("marshal legacy snapshot: %v", err)
	}
	var roundTrip PaperSnapshot
	if err := json.Unmarshal(stored, &roundTrip); err != nil {
		t.Fatalf("unmarshal legacy snapshot: %v", err)
	}
	if got := roundTrip.TotalFor("A"); got != 25 {
		t.Errorf("round-tripped TotalFor(A) = %v, want 25", got)
	}
}

func TestSnapshotFixedPaperKeepsSingleTotal(t *testing.T) {
	fixed := PaperSnapshot{
		PaperType:   "fixed",
		TotalScore:  40,
		GroupTotals: map[string]float64{"A": 40},
		Questions:   []SnapshotQuestion{{PaperGroup: "A", Score: 40}},
	}
	if got := fixed.TotalFor("A"); got != 40 {
		t.Errorf("TotalFor(A) = %v, want 40", got)
	}
	if got := fixed.DisplayTotal(); got != 40 {
		t.Errorf("DisplayTotal() = %v, want 40", got)
	}
}
