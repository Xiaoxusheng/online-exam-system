package store

import (
	"log/slog"
	"time"
)

const (
	EventExamPublished    = "exam_published"
	EventExamClosed       = "exam_closed"
	EventAttemptStarted   = "attempt_started"
	EventAttemptSubmitted = "attempt_submitted"
	EventProctorAlarm     = "proctor_event"
	EventProctorHandled   = "proctor_event_handled"
)

// RealtimeEvent is broadcast into the proctor room of one exam after a committed change.
type RealtimeEvent struct {
	Type      string    `json:"type"`
	ExamID    string    `json:"exam_id"`
	AttemptID string    `json:"attempt_id,omitempty"`
	UserID    string    `json:"user_id,omitempty"`
	UserName  string    `json:"user_name,omitempty"`
	Detail    any       `json:"detail,omitempty"`
	Timestamp time.Time `json:"timestamp"`
}

// RealtimePublisher is implemented by the transport layer (WebSocket hub).
// The store never imports the HTTP package, so the dependency stays one-way.
type RealtimePublisher interface {
	PublishRealtime(event RealtimeEvent)
}

// UseRealtime must be called before the server starts serving requests.
func (s *Store) UseRealtime(p RealtimePublisher) {
	s.realtime = p
}

func (s *Store) emit(event RealtimeEvent) {
	if s.realtime == nil {
		return
	}
	event.Timestamp = time.Now()
	defer func() {
		// A panicking publisher must never break the exam flow.
		if rec := recover(); rec != nil {
			slog.Error("realtime publish panicked", "type", event.Type, "exam_id", event.ExamID, "panic", rec)
		}
	}()
	s.realtime.PublishRealtime(event)
}
