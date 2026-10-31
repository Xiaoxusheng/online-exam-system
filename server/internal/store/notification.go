package store

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type Notification struct {
	ID         string     `json:"id"`
	Channel    string     `json:"channel"`
	Title      string     `json:"title"`
	Content    string     `json:"content"`
	Status     string     `json:"status"`
	SourceType string     `json:"source_type"`
	SourceID   string     `json:"source_id"`
	SentAt     *time.Time `json:"sent_at"`
	CreatedAt  time.Time  `json:"created_at"`
}

type NotificationTemplate struct {
	ID         string    `json:"id"`
	Channel    string    `json:"channel"`
	Code       string    `json:"code"`
	TitleTpl   string    `json:"title_tpl"`
	ContentTpl string    `json:"content_tpl"`
	Enabled    bool      `json:"enabled"`
	CreatedAt  time.Time `json:"created_at"`
}

func (s *Store) ListNotifications(ctx context.Context, userID string, page, pageSize int) ([]Notification, int64, error) {
	var total int64
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE user_id = $1::uuid`, userID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count notifications: %w", err)
	}

	rows, err := s.pool.Query(ctx, `
		SELECT id::text, channel, title, content, status, source_type, source_id, sent_at, created_at
		FROM notifications
		WHERE user_id = $1::uuid
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3`, userID, pageSize, (page-1)*pageSize)
	if err != nil {
		return nil, 0, fmt.Errorf("list notifications: %w", err)
	}
	defer rows.Close()

	items := make([]Notification, 0, pageSize)
	for rows.Next() {
		var item Notification
		if err := rows.Scan(&item.ID, &item.Channel, &item.Title, &item.Content, &item.Status,
			&item.SourceType, &item.SourceID, &item.SentAt, &item.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan notification: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("iterate notifications: %w", err)
	}
	return items, total, nil
}

func (s *Store) MarkNotificationRead(ctx context.Context, userID, notificationID string) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE notifications SET status = 'read'
		WHERE id = $1::uuid AND user_id = $2::uuid AND status <> 'read'`, notificationID, userID)
	if err != nil {
		return fmt.Errorf("mark notification read: %w", err)
	}
	if tag.RowsAffected() == 0 {
		var exists bool
		if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM notifications WHERE id = $1::uuid AND user_id = $2::uuid)`, notificationID, userID).Scan(&exists); err != nil {
			return fmt.Errorf("check notification: %w", err)
		}
		if !exists {
			return ErrNotFound
		}
	}
	return nil
}

func (s *Store) ListNotificationTemplates(ctx context.Context, orgID string) ([]NotificationTemplate, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id::text, channel, code, title_tpl, content_tpl, enabled, created_at
		FROM notification_templates
		WHERE org_id = $1
		ORDER BY created_at DESC`, orgID)
	if err != nil {
		return nil, fmt.Errorf("list notification templates: %w", err)
	}
	defer rows.Close()

	templates := make([]NotificationTemplate, 0)
	for rows.Next() {
		var item NotificationTemplate
		if err := rows.Scan(&item.ID, &item.Channel, &item.Code, &item.TitleTpl, &item.ContentTpl, &item.Enabled, &item.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan notification template: %w", err)
		}
		templates = append(templates, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate notification templates: %w", err)
	}
	return templates, nil
}

const notificationChannelInApp = "inapp"

// UpdateNotificationTemplate edits the wording of one channel template. Placeholders stay as typed
// text; the sender replaces them at dispatch time.
func (s *Store) UpdateNotificationTemplate(ctx context.Context, orgID, templateID, titleTpl, contentTpl string, enabled bool) (NotificationTemplate, error) {
	var item NotificationTemplate
	err := s.pool.QueryRow(ctx, `
		UPDATE notification_templates
		SET title_tpl = $3, content_tpl = $4, enabled = $5, updated_at = now()
		WHERE id = $1::uuid AND org_id = $2::uuid
		RETURNING id::text, channel, code, title_tpl, content_tpl, enabled, created_at`,
		templateID, orgID, titleTpl, contentTpl, enabled).
		Scan(&item.ID, &item.Channel, &item.Code, &item.TitleTpl, &item.ContentTpl, &item.Enabled, &item.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return NotificationTemplate{}, ErrNotFound
		}
		return NotificationTemplate{}, fmt.Errorf("update notification template: %w", err)
	}
	return item, nil
}

// NotificationLog is one row of the organisation-wide delivery ledger.
type NotificationLog struct {
	ID          string     `json:"id"`
	UserName    string     `json:"user_name"`
	UserAccount string     `json:"user_account"`
	Channel     string     `json:"channel"`
	Title       string     `json:"title"`
	Content     string     `json:"content"`
	Status      string     `json:"status"`
	SourceType  string     `json:"source_type"`
	SentAt      *time.Time `json:"sent_at"`
	CreatedAt   time.Time  `json:"created_at"`
}

func (s *Store) ListNotificationLogs(ctx context.Context, orgID, status, keyword string, page, pageSize int) ([]NotificationLog, int64, error) {
	where := []string{"n.org_id = $1::uuid"}
	args := []any{orgID}
	if status != "" {
		args = append(args, status)
		where = append(where, fmt.Sprintf("n.status = $%d", len(args)))
	}
	if keyword != "" {
		args = append(args, "%"+keyword+"%")
		n := len(args)
		where = append(where, fmt.Sprintf("(n.title ILIKE $%d OR n.content ILIKE $%d OR u.name ILIKE $%d)", n, n, n))
	}
	whereSQL := strings.Join(where, " AND ")
	base := `
		FROM notifications n
		JOIN users u ON u.id = n.user_id
		WHERE ` + whereSQL

	var total int64
	if err := s.pool.QueryRow(ctx, `SELECT count(*) `+base, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count notification logs: %w", err)
	}
	args = append(args, pageSize, (page-1)*pageSize)
	rows, err := s.pool.Query(ctx, `
		SELECT n.id::text, u.name, u.username, n.channel, n.title, n.content, n.status, n.source_type, n.sent_at, n.created_at
		`+base+`
		ORDER BY n.created_at DESC
		LIMIT $`+fmt.Sprint(len(args)-1)+` OFFSET $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list notification logs: %w", err)
	}
	defer rows.Close()

	items := make([]NotificationLog, 0, pageSize)
	for rows.Next() {
		var item NotificationLog
		if err := rows.Scan(&item.ID, &item.UserName, &item.UserAccount, &item.Channel, &item.Title, &item.Content,
			&item.Status, &item.SourceType, &item.SentAt, &item.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan notification log: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("iterate notification logs: %w", err)
	}
	return items, total, nil
}

// notifyUser writes one in-app notification. The (user, source_type, source_id) unique
// index makes the write idempotent: republishing an exam or a score never spams people.
// sourceType doubles as the template code, so an enabled template overrides the built-in
// wording; vars fills the {placeholders} of that template.
func notifyUser(ctx context.Context, db DBTX, orgID, userID, title, content, sourceType, sourceID string, vars map[string]string) (bool, error) {
	title, content = renderTemplate(ctx, db, orgID, sourceType, title, content, vars)
	tag, err := db.Exec(ctx, `
		INSERT INTO notifications (org_id, user_id, channel, title, content, status, sent_at, source_type, source_id)
		VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'sent', now(), $6, $7)
		ON CONFLICT (user_id, source_type, source_id) WHERE source_type <> '' DO NOTHING`,
		orgID, userID, notificationChannelInApp, title, content, sourceType, sourceID)
	if err != nil {
		return false, fmt.Errorf("insert notification: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

// renderTemplate resolves the organisation's wording for one code. Any failure to find an
// enabled template falls back to the compiled-in text so a notification is never lost.
func renderTemplate(ctx context.Context, db DBTX, orgID, code, fallbackTitle, fallbackContent string, vars map[string]string) (string, string) {
	if code == "" {
		return fallbackTitle, fallbackContent
	}
	var (
		titleTpl   string
		contentTpl string
		enabled    bool
	)
	err := db.QueryRow(ctx, `
		SELECT title_tpl, content_tpl, enabled
		FROM notification_templates
		WHERE org_id = $1::uuid AND channel = 'inapp' AND code = $2
		LIMIT 1`, orgID, code).Scan(&titleTpl, &contentTpl, &enabled)
	if err != nil || !enabled {
		return fallbackTitle, fallbackContent
	}
	title := expandPlaceholders(titleTpl, vars)
	content := expandPlaceholders(contentTpl, vars)
	if strings.TrimSpace(title) == "" {
		title = fallbackTitle
	}
	if strings.TrimSpace(content) == "" {
		content = fallbackContent
	}
	return title, content
}

// expandPlaceholders replaces {key} tokens; unknown tokens are dropped so an edited template
// can never leak a raw placeholder into a student-facing message.
func expandPlaceholders(text string, vars map[string]string) string {
	if text == "" {
		return ""
	}
	return placeholderPattern.ReplaceAllStringFunc(text, func(match string) string {
		key := strings.Trim(match, "{}")
		if value, ok := vars[key]; ok {
			return value
		}
		return ""
	})
}

var placeholderPattern = regexp.MustCompile(`\{[a-z_]+\}`)

func notifyMany(ctx context.Context, db DBTX, orgID string, userIDs []string, title, content, sourceType, sourceID string, vars map[string]string) error {
	for _, userID := range userIDs {
		if _, err := notifyUser(ctx, db, orgID, userID, title, content, sourceType, sourceID, vars); err != nil {
			return err
		}
	}
	return nil
}
