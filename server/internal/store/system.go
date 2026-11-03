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

// MonitorStats 运行监控（A-08）：概览 + 最近 24 小时活动 + 媒体用量。
type MonitorStats struct {
	Overview                SystemOverview `json:"overview"`
	AttemptsSubmitted24h    int64          `json:"attempts_submitted_24h"`
	ProctorEvents24h        int64          `json:"proctor_events_24h"`
	UnhandledProctorEvents  int64          `json:"unhandled_proctor_events"`
	NotificationsFailed24h  int64          `json:"notifications_failed_24h"`
	FailedLogins24h         int64          `json:"failed_logins_24h"`
	StorageActiveCount      int64          `json:"storage_active_count"`
	StorageActiveBytes      int64          `json:"storage_active_bytes"`
	StorageDeletedPending   int64          `json:"storage_deleted_pending"`
}

func (s *Store) GetMonitorStats(ctx context.Context, orgID string) (MonitorStats, error) {
	stats := MonitorStats{}
	overview, err := s.GetSystemOverview(ctx, orgID)
	if err != nil {
		return stats, err
	}
	stats.Overview = overview

	err = s.pool.QueryRow(ctx, `
		SELECT
			(SELECT count(*) FROM attempts a JOIN exams e ON e.id = a.exam_id
				WHERE e.org_id = $1 AND a.submitted_at >= now() - interval '24 hours'),
			(SELECT count(*) FROM proctor_events pe JOIN exams e ON e.id = pe.exam_id
				WHERE e.org_id = $1 AND pe.occurred_at >= now() - interval '24 hours'),
			(SELECT count(*) FROM proctor_events pe JOIN exams e ON e.id = pe.exam_id
				WHERE e.org_id = $1 AND pe.handled_by IS NULL),
			(SELECT count(*) FROM notifications
				WHERE org_id = $1::uuid AND status = 'failed' AND created_at >= now() - interval '24 hours'),
			(SELECT count(*) FROM audit_logs
				WHERE org_id = $1::uuid AND action = 'auth.login_failed' AND created_at >= now() - interval '24 hours')`,
		orgID,
	).Scan(&stats.AttemptsSubmitted24h, &stats.ProctorEvents24h, &stats.UnhandledProctorEvents,
		&stats.NotificationsFailed24h, &stats.FailedLogins24h)
	if err != nil {
		return stats, fmt.Errorf("load monitor activity: %w", err)
	}

	if err := s.pool.QueryRow(ctx, `
		SELECT COALESCE(sum(size_bytes), 0)::bigint, count(*)
		FROM media_files WHERE org_id = $1::uuid AND status = 'active'`,
		orgID,
	).Scan(&stats.StorageActiveBytes, &stats.StorageActiveCount); err != nil {
		return stats, fmt.Errorf("load monitor storage: %w", err)
	}
	if err := s.pool.QueryRow(ctx, `
		SELECT count(*) FROM media_files WHERE org_id = $1::uuid AND status = 'deleted'`,
		orgID,
	).Scan(&stats.StorageDeletedPending); err != nil {
		return stats, fmt.Errorf("load monitor storage pending: %w", err)
	}
	return stats, nil
}

// UserDataExport 个人数据导出（A-07）：账号、答卷、成绩、通知与相关审计的单文件 JSON。
type UserDataExport struct {
	ExportedAt    time.Time       `json:"exported_at"`
	User          json.RawMessage `json:"user"`
	Attempts      json.RawMessage `json:"attempts"`
	Scores        json.RawMessage `json:"scores"`
	Notifications json.RawMessage `json:"notifications"`
	AuditLogs     json.RawMessage `json:"audit_logs"`
}

func (s *Store) ExportUserData(ctx context.Context, orgID, userID string) (UserDataExport, error) {
	export := UserDataExport{ExportedAt: time.Now()}
	scan := func(dest *json.RawMessage, query string) error {
		return s.pool.QueryRow(ctx, query, orgID, userID).Scan(dest)
	}
	if err := scan(&export.User, `
		SELECT COALESCE((SELECT row_to_json(t) FROM (
			SELECT id::text, name, username, phone, email, role, data_scope, status, created_at, last_login_at
			FROM users WHERE org_id = $1 AND id = $2::uuid) t), '{}'::jsonb)`); err != nil {
		return export, fmt.Errorf("export user: %w", err)
	}
	if err := scan(&export.Attempts, `
		SELECT COALESCE(json_agg(t), '[]'::jsonb) FROM (
			SELECT a.id::text, e.title AS exam_title, a.status, a.paper_group,
				a.score::float8, a.started_at, a.submitted_at
			FROM attempts a JOIN exams e ON e.id = a.exam_id
			WHERE e.org_id = $1 AND a.user_id = $2::uuid
			ORDER BY a.started_at) t`); err != nil {
		return export, fmt.Errorf("export attempts: %w", err)
	}
	if err := scan(&export.Scores, `
		SELECT COALESCE(json_agg(t), '[]'::jsonb) FROM (
			SELECT sr.attempt_id::text, sr.total::float8, sr.status, sr.published_at
			FROM score_records sr
			JOIN attempts a ON a.id = sr.attempt_id
			JOIN exams e ON e.id = a.exam_id
			WHERE e.org_id = $1 AND a.user_id = $2::uuid
			ORDER BY sr.created_at) t`); err != nil {
		return export, fmt.Errorf("export scores: %w", err)
	}
	if err := scan(&export.Notifications, `
		SELECT COALESCE(json_agg(t), '[]'::jsonb) FROM (
			SELECT title, content, source_type, source_id::text, status, created_at
			FROM notifications WHERE org_id = $1 AND user_id = $2::uuid
			ORDER BY created_at DESC LIMIT 200) t`); err != nil {
		return export, fmt.Errorf("export notifications: %w", err)
	}
	if err := scan(&export.AuditLogs, `
		SELECT COALESCE(json_agg(t), '[]'::jsonb) FROM (
			SELECT action, target_type, target_id::text, detail, ip, created_at
			FROM audit_logs WHERE org_id = $1 AND (actor_id = $2::uuid OR target_id = $2::uuid)
			ORDER BY created_at DESC LIMIT 500) t`); err != nil {
		return export, fmt.Errorf("export audit logs: %w", err)
	}
	return export, nil
}

// AnonymizeUser 数据合规注销（A-07）：停用账号并抹除个人身份信息，
// 考试与成绩记录按教育数据保留要求原样保留，动作写审计。
func (s *Store) AnonymizeUser(ctx context.Context, orgID, userID, actorID string) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE users
		SET status = 'disabled', name = '已注销用户',
			username = 'anonymized_' || substring(id::text, 1, 8),
			phone = '', email = '', security_stamp = now()
		WHERE id = $1::uuid AND org_id = $2::uuid AND role = 'student' AND status <> 'anonymized'`,
		userID, orgID)
	if err != nil {
		return fmt.Errorf("anonymize user: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrInvalidState
	}
	return nil
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
		ORDER BY a.created_at DESC, a.id DESC
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
