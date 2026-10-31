package store

import (
	"context"
	"fmt"
	"time"
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

// notifyUser writes one in-app notification. The (user, source_type, source_id) unique
// index makes the write idempotent: republishing an exam or a score never spams people.
func notifyUser(ctx context.Context, db DBTX, orgID, userID, title, content, sourceType, sourceID string) (bool, error) {
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

func notifyMany(ctx context.Context, db DBTX, orgID string, userIDs []string, title, content, sourceType, sourceID string) error {
	for _, userID := range userIDs {
		if _, err := notifyUser(ctx, db, orgID, userID, title, content, sourceType, sourceID); err != nil {
			return err
		}
	}
	return nil
}
