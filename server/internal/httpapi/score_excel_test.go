package httpapi

import (
	"testing"
	"time"

	"online-exam-system/server/internal/store"
)

func TestDurationTextKeepsHoursMinutesSeconds(t *testing.T) {
	started := time.Date(2026, 11, 1, 9, 0, 0, 0, time.Local)
	cases := []struct {
		name      string
		submitted *time.Time
		want      string
	}{
		{name: "nil submit", submitted: nil, want: ""},
		{name: "ninety minutes", submitted: ptrTime(started.Add(90*time.Minute + 30*time.Second)), want: "1时30分30秒"},
		{name: "under a minute", submitted: ptrTime(started.Add(42 * time.Second)), want: "0分42秒"},
		{name: "negative", submitted: ptrTime(started.Add(-time.Minute)), want: ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := durationText(started, tc.submitted); got != tc.want {
				t.Errorf("durationText() = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestJudgedRowsSkipsSheetsStillWaitingForReview(t *testing.T) {
	rows := []store.ScoreExportRow{
		{UserName: "待阅", AttemptState: "submitted", Total: 10},
		{UserName: "已判", AttemptState: "graded", Total: 80},
		{UserName: "已发布", AttemptState: "published", Total: 90},
	}
	judged := judgedRows(rows)
	if len(judged) != 2 {
		t.Fatalf("judgedRows returned %d rows, want 2", len(judged))
	}
	for _, item := range judged {
		if item.AttemptState == "submitted" {
			t.Errorf("ungraded sheet %q leaked into summary statistics", item.UserName)
		}
	}
}

func ptrTime(value time.Time) *time.Time {
	return &value
}
