package store

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

type SystemOverview struct {
	Users              int64 `json:"users"`
	Students           int64 `json:"students"`
	Campuses           int64 `json:"campuses"`
	Classes            int64 `json:"classes"`
	QuestionBanks      int64 `json:"question_banks"`
	Questions          int64 `json:"questions"`
	QuestionsPending   int64 `json:"questions_pending"`
	Papers             int64 `json:"papers"`
	PapersPending      int64 `json:"papers_pending"`
	Exams              int64 `json:"exams"`
	ExamsInProgress    int64 `json:"exams_in_progress"`
	AttemptsInProgress int64 `json:"attempts_in_progress"`
}

func (s *Store) GetSystemOverview(ctx context.Context, orgID string) (SystemOverview, error) {
	var overview SystemOverview
	err := s.pool.QueryRow(ctx, `
		SELECT
			(SELECT count(*) FROM users WHERE org_id = $1 AND status = 'active'),
			(SELECT count(*) FROM users WHERE org_id = $1 AND role = 'student' AND status = 'active'),
			(SELECT count(*) FROM campuses WHERE org_id = $1),
			(SELECT count(*) FROM classes WHERE org_id = $1),
			(SELECT count(*) FROM question_banks WHERE org_id = $1),
			(SELECT count(*) FROM questions WHERE org_id = $1),
			(SELECT count(*) FROM questions WHERE org_id = $1 AND status = 'pending_review'),
			(SELECT count(*) FROM papers WHERE org_id = $1),
			(SELECT count(*) FROM papers WHERE org_id = $1 AND status = 'pending_review'),
			(SELECT count(*) FROM exams WHERE org_id = $1),
			(SELECT count(*) FROM exams WHERE org_id = $1 AND status = 'in_progress'),
			(SELECT count(*) FROM attempts a JOIN exams e ON e.id = a.exam_id WHERE e.org_id = $1 AND a.status = 'in_progress')`,
		orgID,
	).Scan(&overview.Users, &overview.Students, &overview.Campuses, &overview.Classes,
		&overview.QuestionBanks, &overview.Questions, &overview.QuestionsPending,
		&overview.Papers, &overview.PapersPending, &overview.Exams, &overview.ExamsInProgress,
		&overview.AttemptsInProgress)
	if err != nil {
		return SystemOverview{}, fmt.Errorf("load system overview: %w", err)
	}
	return overview, nil
}

type AuditLogItem struct {
	ID         int64           `json:"id"`
	ActorID    *string         `json:"actor_id"`
	ActorName  string          `json:"actor_name"`
	Action     string          `json:"action"`
	TargetType string          `json:"target_type"`
	TargetID   string          `json:"target_id"`
	Detail     json.RawMessage `json:"detail"`
	IP         string          `json:"ip"`
	UserAgent  string          `json:"user_agent"`
	CreatedAt  time.Time       `json:"created_at"`
}

type AuditFilter struct {
	Action     string
	TargetType string
	Keyword    string
	From       *time.Time
	To         *time.Time
	Page       int
	PageSize   int
}

func (s *Store) ListAuditLogs(ctx context.Context, orgID string, f AuditFilter) ([]AuditLogItem, int64, error) {
	where := []string{"a.org_id = $1"}
	args := []any{orgID}
	if f.Action != "" {
		args = append(args, f.Action)
		where = append(where, fmt.Sprintf("a.action = $%d", len(args)))
	}
	if f.TargetType != "" {
		args = append(args, f.TargetType)
		where = append(where, fmt.Sprintf("a.target_type = $%d", len(args)))
	}
	if f.Keyword != "" {
		args = append(args, "%"+f.Keyword+"%")
		where = append(where, fmt.Sprintf("u.name ILIKE $%d", len(args)))
	}
	if f.From != nil {
		args = append(args, *f.From)
		where = append(where, fmt.Sprintf("a.created_at >= $%d", len(args)))
	}
	if f.To != nil {
		args = append(args, *f.To)
		where = append(where, fmt.Sprintf("a.created_at <= $%d", len(args)))
	}
	whereSQL := strings.Join(where, " AND ")

	var total int64
	if err := s.pool.QueryRow(ctx, `
		SELECT count(*) FROM audit_logs a
		LEFT JOIN users u ON u.id = a.actor_id
		WHERE `+whereSQL, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count audit logs: %w", err)
	}

	args = append(args, f.PageSize, (f.Page-1)*f.PageSize)
	rows, err := s.pool.Query(ctx, `
		SELECT a.id, a.actor_id::text, COALESCE(u.name, '系统'), a.action, a.target_type,
			a.target_id, a.detail, a.ip, a.user_agent, a.created_at
		FROM audit_logs a
		LEFT JOIN users u ON u.id = a.actor_id
		WHERE `+whereSQL+`
		ORDER BY a.created_at DESC
		LIMIT $`+fmt.Sprint(len(args)-1)+` OFFSET $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list audit logs: %w", err)
	}
	defer rows.Close()

	logs := make([]AuditLogItem, 0, f.PageSize)
	for rows.Next() {
		var item AuditLogItem
		if err := rows.Scan(&item.ID, &item.ActorID, &item.ActorName, &item.Action, &item.TargetType,
			&item.TargetID, &item.Detail, &item.IP, &item.UserAgent, &item.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan audit log: %w", err)
		}
		logs = append(logs, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("iterate audit logs: %w", err)
	}
	return logs, total, nil
}
