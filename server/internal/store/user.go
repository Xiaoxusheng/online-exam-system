package store

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type User struct {
	ID          string
	OrgID       string
	Name        string
	Username    string
	Phone       string
	Email       string
	Role        string
	DataScope   string
	Status      string
	CampusID    *string
	ClassID     *string
	LastLoginAt *time.Time
	CreatedAt   time.Time
}

const userColumns = `id::text, org_id::text, name, username, phone, email, role, data_scope, status,
	campus_id::text, class_id::text, last_login_at, created_at`

func userScanDest(u *User) []any {
	return []any{
		&u.ID, &u.OrgID, &u.Name, &u.Username, &u.Phone, &u.Email, &u.Role, &u.DataScope,
		&u.Status, &u.CampusID, &u.ClassID, &u.LastLoginAt, &u.CreatedAt,
	}
}

func (s *Store) FindUserByAccount(ctx context.Context, account string) (User, string, error) {
	var u User
	var passwordHash string
	err := s.pool.QueryRow(ctx, `
		SELECT `+userColumns+`, password_hash
		FROM users
		WHERE username = $1 OR (phone <> '' AND phone = $1)
		ORDER BY created_at
		LIMIT 1`, account,
	).Scan(append(userScanDest(&u), &passwordHash)...)
	if err != nil {
		return User{}, "", fmt.Errorf("find user by account: %w", err)
	}
	return u, passwordHash, nil
}

func (s *Store) FindUserByID(ctx context.Context, id string) (User, error) {
	var u User
	err := s.pool.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE id = $1`, id).
		Scan(userScanDest(&u)...)
	if err != nil {
		return User{}, fmt.Errorf("find user by id: %w", err)
	}
	return u, nil
}

func (s *Store) FindUserInOrg(ctx context.Context, orgID, id string) (User, error) {
	var u User
	err := s.pool.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE id = $1 AND org_id = $2`, id, orgID).
		Scan(userScanDest(&u)...)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return User{}, ErrNotFound
		}
		return User{}, fmt.Errorf("find user in org: %w", err)
	}
	return u, nil
}

func (s *Store) TouchLastLogin(ctx context.Context, id string) error {
	if _, err := s.pool.Exec(ctx, `UPDATE users SET last_login_at = now() WHERE id = $1`, id); err != nil {
		return fmt.Errorf("touch last login: %w", err)
	}
	return nil
}

type UserFilter struct {
	Role     string
	Status   string
	Keyword  string
	CampusID string
	ClassID  string
	Page     int
	PageSize int
}

func (s *Store) ListUsers(ctx context.Context, orgID string, f UserFilter) ([]User, int64, error) {
	where := []string{"org_id = $1"}
	args := []any{orgID}

	if f.Role != "" {
		args = append(args, f.Role)
		where = append(where, fmt.Sprintf("role = $%d", len(args)))
	}
	if f.Status != "" {
		args = append(args, f.Status)
		where = append(where, fmt.Sprintf("status = $%d", len(args)))
	}
	if f.CampusID != "" {
		args = append(args, f.CampusID)
		where = append(where, fmt.Sprintf("campus_id = $%d::uuid", len(args)))
	}
	if f.ClassID != "" {
		args = append(args, f.ClassID)
		where = append(where, fmt.Sprintf("class_id = $%d::uuid", len(args)))
	}
	if f.Keyword != "" {
		args = append(args, "%"+f.Keyword+"%")
		n := len(args)
		where = append(where, fmt.Sprintf("(name ILIKE $%d OR username ILIKE $%d OR phone ILIKE $%d)", n, n, n))
	}

	whereSQL := strings.Join(where, " AND ")
	var total int64
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM users WHERE `+whereSQL, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count users: %w", err)
	}

	args = append(args, f.PageSize, (f.Page-1)*f.PageSize)
	rows, err := s.pool.Query(ctx, `
		SELECT `+userColumns+`
		FROM users
		WHERE `+whereSQL+`
		ORDER BY created_at DESC
		LIMIT $`+fmt.Sprint(len(args)-1)+` OFFSET $`+fmt.Sprint(len(args)), args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()

	users := make([]User, 0, f.PageSize)
	for rows.Next() {
		var u User
		if err := rows.Scan(userScanDest(&u)...); err != nil {
			return nil, 0, fmt.Errorf("scan user: %w", err)
		}
		users = append(users, u)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("iterate users: %w", err)
	}
	return users, total, nil
}

type CreateUserParams struct {
	OrgID        string
	Name         string
	Username     string
	Phone        string
	Email        string
	PasswordHash string
	Role         string
	DataScope    string
	Status       string
	CampusID     string
	ClassID      string
}

func (s *Store) CreateUser(ctx context.Context, p CreateUserParams) (User, error) {
	if err := s.validateMembership(ctx, p.OrgID, p.CampusID, p.ClassID); err != nil {
		return User{}, err
	}

	var u User
	err := s.pool.QueryRow(ctx, `
		INSERT INTO users (org_id, name, username, phone, email, password_hash, role, data_scope, status, campus_id, class_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE(NULLIF($9, ''), 'active'), NULLIF($10, '')::uuid, NULLIF($11, '')::uuid)
		RETURNING `+userColumns,
		p.OrgID, p.Name, p.Username, p.Phone, p.Email, p.PasswordHash, p.Role, p.DataScope, p.Status, p.CampusID, p.ClassID,
	).Scan(userScanDest(&u)...)
	if err != nil {
		return User{}, fmt.Errorf("create user: %w", mapUniqueViolation(err))
	}
	return u, nil
}

type UpdateUserParams struct {
	Name         *string
	Phone        *string
	Email        *string
	Role         *string
	DataScope    *string
	Status       *string
	CampusID     *string
	ClassID      *string
	PasswordHash *string
}

func (s *Store) UpdateUser(ctx context.Context, orgID, userID string, p UpdateUserParams) (User, error) {
	u, err := s.FindUserInOrg(ctx, orgID, userID)
	if err != nil {
		return User{}, err
	}

	if p.Name != nil {
		u.Name = *p.Name
	}
	if p.Phone != nil {
		u.Phone = *p.Phone
	}
	if p.Email != nil {
		u.Email = *p.Email
	}
	if p.Role != nil {
		u.Role = *p.Role
	}
	if p.DataScope != nil {
		u.DataScope = *p.DataScope
	}
	if p.Status != nil {
		u.Status = *p.Status
	}
	campusID := derefString(u.CampusID)
	if p.CampusID != nil {
		campusID = *p.CampusID
	}
	classID := derefString(u.ClassID)
	if p.ClassID != nil {
		classID = *p.ClassID
	}
	if err := s.validateMembership(ctx, orgID, campusID, classID); err != nil {
		return User{}, err
	}

	passwordHash := ""
	if p.PasswordHash != nil {
		passwordHash = *p.PasswordHash
	}
	_, err = s.pool.Exec(ctx, `
		UPDATE users
		SET name = $1, phone = $2, email = $3, role = $4, data_scope = $5, status = $6,
			campus_id = NULLIF($7, '')::uuid, class_id = NULLIF($8, '')::uuid,
			password_hash = COALESCE(NULLIF($9, ''), password_hash)
		WHERE id = $10 AND org_id = $11`,
		u.Name, u.Phone, u.Email, u.Role, u.DataScope, u.Status, campusID, classID, passwordHash, userID, orgID,
	)
	if err != nil {
		return User{}, fmt.Errorf("update user: %w", mapUniqueViolation(err))
	}
	return s.FindUserInOrg(ctx, orgID, userID)
}

func (s *Store) validateMembership(ctx context.Context, orgID, campusID, classID string) error {
	if campusID != "" {
		var exists bool
		if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM campuses WHERE id = $1::uuid AND org_id = $2)`, campusID, orgID).Scan(&exists); err != nil {
			return fmt.Errorf("validate campus: %w", err)
		}
		if !exists {
			return fmt.Errorf("campus %s: %w", campusID, ErrNotFound)
		}
	}
	if classID != "" {
		var exists bool
		if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM classes WHERE id = $1::uuid AND org_id = $2)`, classID, orgID).Scan(&exists); err != nil {
			return fmt.Errorf("validate class: %w", err)
		}
		if !exists {
			return fmt.Errorf("class %s: %w", classID, ErrNotFound)
		}
	}
	return nil
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
