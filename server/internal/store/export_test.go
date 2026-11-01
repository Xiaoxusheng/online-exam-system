package store

import "testing"

func TestPassScoreOfPrefersConfiguredAbsoluteLine(t *testing.T) {
	rules := []byte(`{"pass_score": 36}`)
	if got := passScoreOf(rules, 100); got != 36 {
		t.Errorf("configured pass line = %v, want 36 regardless of group total", got)
	}
	if got := passScoreOf(rules, 50); got != 36 {
		t.Errorf("configured pass line = %v, want 36 for a smaller group", got)
	}
}

func TestPassScoreOfDefaultsToSixtyPercentOfOwnGroup(t *testing.T) {
	// An AB paper hands each group a different full score; the default line has to follow
	// the group being measured, not the A+B sum recorded on the paper.
	if got := passScoreOf(nil, 30); got != 18 {
		t.Errorf("default pass line for group total 30 = %v, want 18", got)
	}
	if got := passScoreOf([]byte(`{}`), 45); got != 27 {
		t.Errorf("default pass line for group total 45 = %v, want 27", got)
	}
	if got := passScoreOf([]byte(`{"pass_score": 0}`), 0); got != 0 {
		t.Errorf("pass line with no total = %v, want 0", got)
	}
}

func TestGroupTotalOfFallsBackWhenGroupUnknown(t *testing.T) {
	snapshot := PaperSnapshot{
		TotalScore:  60,
		GroupTotals: map[string]float64{"A": 30, "B": 30},
	}
	if got := groupTotalOf(snapshot, snapshot.DisplayTotal(), "A"); got != 30 {
		t.Errorf("groupTotalOf(A) = %v, want 30", got)
	}
	if got := groupTotalOf(snapshot, snapshot.DisplayTotal(), ""); got != 30 {
		t.Errorf("groupTotalOf(unknown) = %v, want the 30-point display total", got)
	}
}
