package store

import (
	"context"
	"fmt"
	"time"
)

type DashboardStats struct {
	Students        int64 `json:"students"`
	ExamsInProgress int64 `json:"exams_in_progress"`
	PendingGrading  int64 `json:"pending_grading"`
	PendingReview   int64 `json:"pending_review"`
}

type UpcomingExam struct {
	ID      string    `json:"id"`
	Title   string    `json:"title"`
	Status  string    `json:"status"`
	StartAt time.Time `json:"start_at"`
	EndAt   time.Time `json:"end_at"`
}

type RecentActivity struct {
	Action    string    `json:"action"`
	ActorName string    `json:"actor_name"`
	CreatedAt time.Time `json:"created_at"`
}

type DashboardSummary struct {
	Stats          DashboardStats   `json:"stats"`
	UpcomingExams  []UpcomingExam   `json:"upcoming_exams"`
	RecentActivity []RecentActivity `json:"recent_activity"`
}

func (s *Store) DashboardSummary(ctx context.Context, orgID string) (DashboardSummary, error) {
	summary := DashboardSummary{
		UpcomingExams:  []UpcomingExam{},
		RecentActivity: []RecentActivity{},
	}

	err := s.pool.QueryRow(ctx, `
		SELECT
			(SELECT count(*) FROM users WHERE org_id = $1 AND role = 'student' AND status = 'active'),
			(SELECT count(*) FROM exams WHERE org_id = $1 AND status = 'in_progress'),
			(SELECT count(*) FROM review_tasks rt
				JOIN attempts a ON a.id = rt.attempt_id
				JOIN exams e ON e.id = a.exam_id
				WHERE e.org_id = $1 AND rt.status IN ('pending', 'in_progress')),
			(SELECT count(*) FROM papers WHERE org_id = $1 AND status = 'pending_review')`,
		orgID,
	).Scan(&summary.Stats.Students, &summary.Stats.ExamsInProgress, &summary.Stats.PendingGrading, &summary.Stats.PendingReview)
	if err != nil {
		return summary, fmt.Errorf("load dashboard stats: %w", err)
	}

	rows, err := s.pool.Query(ctx, `
		SELECT id::text, title, status, start_at, end_at
		FROM exams
		WHERE org_id = $1 AND status IN ('draft', 'pending_publish', 'pending_start')
		ORDER BY start_at, id
		LIMIT 5`, orgID)
	if err != nil {
		return summary, fmt.Errorf("load upcoming exams: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var item UpcomingExam
		if err := rows.Scan(&item.ID, &item.Title, &item.Status, &item.StartAt, &item.EndAt); err != nil {
			return summary, fmt.Errorf("scan upcoming exam: %w", err)
		}
		summary.UpcomingExams = append(summary.UpcomingExams, item)
	}
	if err := rows.Err(); err != nil {
		return summary, fmt.Errorf("iterate upcoming exams: %w", err)
	}

	activityRows, err := s.pool.Query(ctx, `
		SELECT a.action, COALESCE(u.name, '系统'), a.created_at
		FROM audit_logs a
		LEFT JOIN users u ON u.id = a.actor_id
		WHERE a.org_id = $1
		ORDER BY a.created_at DESC, a.id DESC
		LIMIT 5`, orgID)
	if err != nil {
		return summary, fmt.Errorf("load recent activity: %w", err)
	}
	defer activityRows.Close()
	for activityRows.Next() {
		var item RecentActivity
		if err := activityRows.Scan(&item.Action, &item.ActorName, &item.CreatedAt); err != nil {
			return summary, fmt.Errorf("scan recent activity: %w", err)
		}
		summary.RecentActivity = append(summary.RecentActivity, item)
	}
	if err := activityRows.Err(); err != nil {
		return summary, fmt.Errorf("iterate recent activity: %w", err)
	}

	return summary, nil
}
