package store

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type ProctorEvent struct {
	ID            int64     `json:"id"`
	ExamID        string    `json:"exam_id"`
	AttemptID     string    `json:"attempt_id"`
	UserID        string    `json:"user_id"`
	UserName      string    `json:"user_name"`
	Type          string    `json:"type"`
	Level         string    `json:"level"`
	SnapshotURL   string    `json:"snapshot_url"`
	OccurredAt    time.Time `json:"occurred_at"`
	HandledBy     *string   `json:"handled_by"`
	HandledByName string    `json:"handled_by_name"`
	Action        string    `json:"action"`
	Note          string    `json:"note"`
	CreatedAt     time.Time `json:"created_at"`
}

type ProctorOverview struct {
	Candidates      int64 `json:"candidates"`
	Waiting         int64 `json:"waiting"`
	Testing         int64 `json:"testing"`
	Submitted       int64 `json:"submitted"`
	Absent          int64 `json:"absent"`
	Online          int64 `json:"online"`
	UnhandledEvents int64 `json:"unhandled_events"`
	WarningEvents   int64 `json:"warning_events"`
	CriticalEvents  int64 `json:"critical_events"`
}

func (s *Store) CreateProctorEvent(ctx context.Context, userID, attemptID, eventType, level, snapshotURL string) (ProctorEvent, error) {
	var examID string
	err := s.pool.QueryRow(ctx, `
		SELECT exam_id::text FROM attempts
		WHERE id = $1 AND user_id = $2 AND status = 'in_progress'`, attemptID, userID).Scan(&examID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ProctorEvent{}, ErrNotFound
		}
		return ProctorEvent{}, fmt.Errorf("load attempt for event: %w", err)
	}

	var eventID int64
	err = s.pool.QueryRow(ctx, `
		INSERT INTO proctor_events (exam_id, attempt_id, type, level, snapshot_url)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id`, examID, attemptID, eventType, level, snapshotURL).Scan(&eventID)
	if err != nil {
		return ProctorEvent{}, fmt.Errorf("create proctor event: %w", err)
	}
	return s.getProctorEvent(ctx, eventID)
}

type ProctorEventFilter struct {
	Level    string
	Handled  string
	Page     int
	PageSize int
}

func (s *Store) ListProctorEvents(ctx context.Context, orgID, examID string, f ProctorEventFilter) ([]ProctorEvent, int64, error) {
	where := []string{"e.org_id = $1", "pe.exam_id = $2::uuid"}
	args := []any{orgID, examID}
	if f.Level != "" {
		args = append(args, f.Level)
		where = append(where, fmt.Sprintf("pe.level = $%d", len(args)))
	}
	if f.Handled == "true" {
		where = append(where, "pe.handled_by IS NOT NULL")
	} else if f.Handled == "false" {
		where = append(where, "pe.handled_by IS NULL")
	}
	whereSQL := strings.Join(where, " AND ")

	base := `
		FROM proctor_events pe
		JOIN exams e ON e.id = pe.exam_id
		JOIN attempts a ON a.id = pe.attempt_id
		JOIN users u ON u.id = a.user_id
		LEFT JOIN users hu ON hu.id = pe.handled_by
		WHERE ` + whereSQL

	var total int64
	if err := s.pool.QueryRow(ctx, `SELECT count(*) `+base, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count proctor events: %w", err)
	}

	args = append(args, f.PageSize, (f.Page-1)*f.PageSize)
	rows, err := s.pool.Query(ctx, `
		SELECT pe.id, pe.exam_id::text, pe.attempt_id::text, u.id::text, u.name, pe.type, pe.level,
			pe.snapshot_url, pe.occurred_at, pe.handled_by::text, COALESCE(hu.name, ''), pe.action, pe.note, pe.created_at
		`+base+`
		ORDER BY pe.occurred_at DESC
		LIMIT $`+fmt.Sprint(len(args)-1)+` OFFSET $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list proctor events: %w", err)
	}
	defer rows.Close()

	events := make([]ProctorEvent, 0, f.PageSize)
	for rows.Next() {
		var event ProctorEvent
		if err := rows.Scan(&event.ID, &event.ExamID, &event.AttemptID, &event.UserID, &event.UserName, &event.Type, &event.Level,
			&event.SnapshotURL, &event.OccurredAt, &event.HandledBy, &event.HandledByName, &event.Action, &event.Note, &event.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan proctor event: %w", err)
		}
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("iterate proctor events: %w", err)
	}
	return events, total, nil
}

func (s *Store) HandleProctorEvent(ctx context.Context, orgID string, eventID int64, actorID, action, note string) (ProctorEvent, error) {
	tag, err := s.pool.Exec(ctx, `
		UPDATE proctor_events pe
		SET handled_by = $1, action = $2, note = $3
		FROM exams e
		WHERE pe.id = $4 AND pe.exam_id = e.id AND e.org_id = $5`,
		actorID, action, note, eventID, orgID)
	if err != nil {
		return ProctorEvent{}, fmt.Errorf("handle proctor event: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ProctorEvent{}, ErrNotFound
	}
	return s.getProctorEvent(ctx, eventID)
}

func (s *Store) getProctorEvent(ctx context.Context, eventID int64) (ProctorEvent, error) {
	var event ProctorEvent
	err := s.pool.QueryRow(ctx, `
		SELECT pe.id, pe.exam_id::text, pe.attempt_id::text, u.id::text, u.name, pe.type, pe.level,
			pe.snapshot_url, pe.occurred_at, pe.handled_by::text, COALESCE(hu.name, ''), pe.action, pe.note, pe.created_at
		FROM proctor_events pe
		JOIN attempts a ON a.id = pe.attempt_id
		JOIN users u ON u.id = a.user_id
		LEFT JOIN users hu ON hu.id = pe.handled_by
		WHERE pe.id = $1`, eventID).Scan(
		&event.ID, &event.ExamID, &event.AttemptID, &event.UserID, &event.UserName, &event.Type, &event.Level,
		&event.SnapshotURL, &event.OccurredAt, &event.HandledBy, &event.HandledByName, &event.Action, &event.Note, &event.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ProctorEvent{}, ErrNotFound
		}
		return ProctorEvent{}, fmt.Errorf("get proctor event: %w", err)
	}
	return event, nil
}

func (s *Store) GetProctorOverview(ctx context.Context, orgID, examID string) (ProctorOverview, error) {
	var exists bool
	if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM exams WHERE id = $1 AND org_id = $2)`, examID, orgID).Scan(&exists); err != nil {
		return ProctorOverview{}, fmt.Errorf("check exam for proctor overview: %w", err)
	}
	if !exists {
		return ProctorOverview{}, ErrNotFound
	}

	var overview ProctorOverview
	err := s.pool.QueryRow(ctx, `
		SELECT count(*),
			count(*) FILTER (WHERE status = 'waiting'),
			count(*) FILTER (WHERE status = 'testing'),
			count(*) FILTER (WHERE status = 'submitted'),
			count(*) FILTER (WHERE status = 'absent'),
			(SELECT count(*) FROM attempts a WHERE a.exam_id = $1 AND a.status = 'in_progress'),
			(SELECT count(*) FROM proctor_events pe WHERE pe.exam_id = $1 AND pe.handled_by IS NULL),
			(SELECT count(*) FROM proctor_events pe WHERE pe.exam_id = $1 AND pe.level = 'warning'),
			(SELECT count(*) FROM proctor_events pe WHERE pe.exam_id = $1 AND pe.level = 'critical')
		FROM exam_candidates
		WHERE exam_id = $1`, examID,
	).Scan(&overview.Candidates, &overview.Waiting, &overview.Testing, &overview.Submitted, &overview.Absent,
		&overview.Online, &overview.UnhandledEvents, &overview.WarningEvents, &overview.CriticalEvents)
	if err != nil {
		return ProctorOverview{}, fmt.Errorf("load proctor overview: %w", err)
	}
	return overview, nil
}
