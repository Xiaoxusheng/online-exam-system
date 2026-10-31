package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

type RefreshToken struct {
	ID        string
	UserID    string
	ExpiresAt time.Time
	RevokedAt *time.Time
}

func (s *Store) CreateRefreshToken(ctx context.Context, userID, tokenHash, userAgent, ip string, expiresAt time.Time) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO refresh_tokens (user_id, token_hash, user_agent, ip, expires_at)
		VALUES ($1::uuid, $2, $3, $4, $5)`, userID, tokenHash, userAgent, ip, expiresAt)
	if err != nil {
		return fmt.Errorf("create refresh token: %w", err)
	}
	return nil
}

// RotateRefreshToken consumes oldHash and stores newHash. A revoked token that is
// presented again is treated as theft: every live token of that user is revoked.
func (s *Store) RotateRefreshToken(ctx context.Context, oldHash, newHash, userAgent, ip string, expiresAt time.Time) (RefreshToken, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return RefreshToken{}, fmt.Errorf("begin rotate refresh token: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var row RefreshToken
	err = tx.QueryRow(ctx, `
		SELECT id::text, user_id::text, expires_at, revoked_at
		FROM refresh_tokens WHERE token_hash = $1
		FOR UPDATE`, oldHash).Scan(&row.ID, &row.UserID, &row.ExpiresAt, &row.RevokedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RefreshToken{}, ErrNotFound
		}
		return RefreshToken{}, fmt.Errorf("load refresh token: %w", err)
	}

	if row.RevokedAt != nil {
		if _, err := tx.Exec(ctx, `
			UPDATE refresh_tokens SET revoked_at = now()
			WHERE user_id = $1::uuid AND revoked_at IS NULL`, row.UserID); err != nil {
			return RefreshToken{}, fmt.Errorf("revoke reused token family: %w", err)
		}
		if err := tx.Commit(ctx); err != nil {
			return RefreshToken{}, fmt.Errorf("commit reuse revocation: %w", err)
		}
		return RefreshToken{}, ErrForbidden
	}
	if time.Now().After(row.ExpiresAt) {
		return RefreshToken{}, ErrExpired
	}

	if _, err := tx.Exec(ctx, `UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1::uuid`, row.ID); err != nil {
		return RefreshToken{}, fmt.Errorf("revoke rotated token: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO refresh_tokens (user_id, token_hash, user_agent, ip, expires_at)
		VALUES ($1::uuid, $2, $3, $4, $5)`, row.UserID, newHash, userAgent, ip, expiresAt); err != nil {
		return RefreshToken{}, fmt.Errorf("store rotated token: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return RefreshToken{}, fmt.Errorf("commit rotate refresh token: %w", err)
	}
	row.ExpiresAt = expiresAt
	return row, nil
}

// RevokeRefreshToken is idempotent so logout never fails on an unknown token.
func (s *Store) RevokeRefreshToken(ctx context.Context, tokenHash string) error {
	if _, err := s.pool.Exec(ctx, `
		UPDATE refresh_tokens SET revoked_at = now()
		WHERE token_hash = $1 AND revoked_at IS NULL`, tokenHash); err != nil {
		return fmt.Errorf("revoke refresh token: %w", err)
	}
	return nil
}

func (s *Store) RevokeAllRefreshTokens(ctx context.Context, userID string) error {
	if _, err := s.pool.Exec(ctx, `
		UPDATE refresh_tokens SET revoked_at = now()
		WHERE user_id = $1::uuid AND revoked_at IS NULL`, userID); err != nil {
		return fmt.Errorf("revoke user refresh tokens: %w", err)
	}
	return nil
}
