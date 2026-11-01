package store

import (
	"context"
	"errors"
	"fmt"
	"sync"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type DBTX interface {
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// ExternalNotifier delivers sms/email on behalf of the store. Implemented by
// the notify.Dispatcher; a nil notifier means external channels stay silent.
type ExternalNotifier interface {
	// Send returns the delivery status (sent | failed | simulated) and an error.
	Send(ctx context.Context, channel, to, subject, body string) (string, error)
	EmailConfigured() bool
	SMSConfigured() bool
}

type Store struct {
	pool     *pgxpool.Pool
	realtime RealtimePublisher

	notifier   ExternalNotifier
	dispatchCh chan dispatchJob
	dispatchWG sync.WaitGroup
}

type Option func(*Store)

func WithNotifier(notifier ExternalNotifier) Option {
	return func(s *Store) {
		s.notifier = notifier
	}
}

func New(pool *pgxpool.Pool, opts ...Option) *Store {
	s := &Store{pool: pool}
	for _, opt := range opts {
		opt(s)
	}
	if s.notifier != nil {
		s.startDispatchWorker()
	}
	return s
}

// Close stops the background delivery worker. Safe to call multiple times.
func (s *Store) Close() {
	if s.dispatchCh != nil {
		close(s.dispatchCh)
		s.dispatchWG.Wait()
		s.dispatchCh = nil
	}
}

// Notifier exposes the wired external notifier for handlers (channel status,
// test sends). Returns nil when no dispatcher was configured.
func (s *Store) Notifier() ExternalNotifier {
	return s.notifier
}

func (s *Store) Pool() *pgxpool.Pool {
	return s.pool
}

func mapUniqueViolation(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return fmt.Errorf("%w: %s", ErrConflict, pgErr.ConstraintName)
	}
	return err
}
