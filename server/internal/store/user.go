package store

import (
	"context"
	"fmt"
	"time"
)

type User struct {
	ID        string
	OrgID     string
	Name      string
	Username  string
	Phone     string
	Email     string
	Role      string
	DataScope string
	Status    string
	CreatedAt time.Time
}

const userColumns = `id::text, org_id::text, name, username, phone, email, role, data_scope, status, created_at`

func (s *Store) FindUserByAccount(ctx context.Context, account string) (User, string, error) {
	var u User
	var passwordHash string
	err := s.pool.QueryRow(ctx, `
		SELECT `+userColumns+`, password_hash
		FROM users
		WHERE username = $1 OR (phone <> '' AND phone = $1)
		ORDER BY created_at
		LIMIT 1`, account,
	).Scan(&u.ID, &u.OrgID, &u.Name, &u.Username, &u.Phone, &u.Email, &u.Role, &u.DataScope, &u.Status, &u.CreatedAt, &passwordHash)
	if err != nil {
		return User{}, "", fmt.Errorf("find user by account: %w", err)
	}
	return u, passwordHash, nil
}

func (s *Store) FindUserByID(ctx context.Context, id string) (User, error) {
	var u User
	err := s.pool.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE id = $1`, id).
		Scan(&u.ID, &u.OrgID, &u.Name, &u.Username, &u.Phone, &u.Email, &u.Role, &u.DataScope, &u.Status, &u.CreatedAt)
	if err != nil {
		return User{}, fmt.Errorf("find user by id: %w", err)
	}
	return u, nil
}

func (s *Store) TouchLastLogin(ctx context.Context, id string) error {
	if _, err := s.pool.Exec(ctx, `UPDATE users SET last_login_at = now() WHERE id = $1`, id); err != nil {
		return fmt.Errorf("touch last login: %w", err)
	}
	return nil
}
