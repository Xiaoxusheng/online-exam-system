package store

import (
	"context"
	"fmt"
	"time"
)

type Campus struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Address   string    `json:"address"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

func (s *Store) ListCampuses(ctx context.Context, orgID string) ([]Campus, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id::text, name, address, status, created_at
		FROM campuses
		WHERE org_id = $1
		ORDER BY created_at`, orgID)
	if err != nil {
		return nil, fmt.Errorf("list campuses: %w", err)
	}
	defer rows.Close()

	campuses := make([]Campus, 0)
	for rows.Next() {
		var c Campus
		if err := rows.Scan(&c.ID, &c.Name, &c.Address, &c.Status, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan campus: %w", err)
		}
		campuses = append(campuses, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate campuses: %w", err)
	}
	return campuses, nil
}

func (s *Store) CreateCampus(ctx context.Context, orgID, name, address string) (Campus, error) {
	var c Campus
	err := s.pool.QueryRow(ctx, `
		INSERT INTO campuses (org_id, name, address)
		VALUES ($1, $2, $3)
		RETURNING id::text, name, address, status, created_at`,
		orgID, name, address,
	).Scan(&c.ID, &c.Name, &c.Address, &c.Status, &c.CreatedAt)
	if err != nil {
		return Campus{}, fmt.Errorf("create campus: %w", mapUniqueViolation(err))
	}
	return c, nil
}

type Class struct {
	ID         string    `json:"id"`
	OrgID      string    `json:"org_id"`
	CampusID   *string   `json:"campus_id"`
	CampusName string    `json:"campus_name"`
	Name       string    `json:"name"`
	Grade      string    `json:"grade"`
	Status     string    `json:"status"`
	CreatedAt  time.Time `json:"created_at"`
}

func (s *Store) ListClasses(ctx context.Context, orgID, campusID string) ([]Class, error) {
	query := `
		SELECT c.id::text, c.org_id::text, c.campus_id::text, COALESCE(cp.name, ''), c.name, c.grade, c.status, c.created_at
		FROM classes c
		LEFT JOIN campuses cp ON cp.id = c.campus_id
		WHERE c.org_id = $1`
	args := []any{orgID}
	if campusID != "" {
		args = append(args, campusID)
		query += ` AND c.campus_id = $2::uuid`
	}
	query += ` ORDER BY c.created_at`

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list classes: %w", err)
	}
	defer rows.Close()

	classes := make([]Class, 0)
	for rows.Next() {
		var c Class
		if err := rows.Scan(&c.ID, &c.OrgID, &c.CampusID, &c.CampusName, &c.Name, &c.Grade, &c.Status, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan class: %w", err)
		}
		classes = append(classes, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate classes: %w", err)
	}
	return classes, nil
}

func (s *Store) CreateClass(ctx context.Context, orgID, campusID, name, grade string) (Class, error) {
	if campusID != "" {
		var exists bool
		if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM campuses WHERE id = $1::uuid AND org_id = $2)`, campusID, orgID).Scan(&exists); err != nil {
			return Class{}, fmt.Errorf("validate campus: %w", err)
		}
		if !exists {
			return Class{}, ErrNotFound
		}
	}

	var c Class
	err := s.pool.QueryRow(ctx, `
		INSERT INTO classes (org_id, campus_id, name, grade)
		VALUES ($1, NULLIF($2, '')::uuid, $3, $4)
		RETURNING id::text, org_id::text, campus_id::text, '', name, grade, status, created_at`,
		orgID, campusID, name, grade,
	).Scan(&c.ID, &c.OrgID, &c.CampusID, &c.CampusName, &c.Name, &c.Grade, &c.Status, &c.CreatedAt)
	if err != nil {
		return Class{}, fmt.Errorf("create class: %w", mapUniqueViolation(err))
	}
	if campusID != "" {
		_ = s.pool.QueryRow(ctx, `SELECT name FROM campuses WHERE id = $1::uuid`, campusID).Scan(&c.CampusName)
	}
	return c, nil
}
