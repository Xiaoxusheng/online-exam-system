package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// OrgBranding is the public-facing identity of the organisation: login page
// headline, sidebar mark and candidate portal header all render from it.
type OrgBranding struct {
	OrgID         string  `json:"org_id"`
	Name          string  `json:"name"`
	Slogan        string  `json:"slogan"`
	LogoMediaID   string  `json:"logo_media_id"`
	LogoURL       *string `json:"logo_url"`
	LegacyLogoURL string  `json:"-"`
}

const brandingColumns = `o.id::text, o.name, o.brand_slogan, COALESCE(o.brand_logo_media_id::text, ''),
	CASE WHEN o.brand_logo_media_id IS NULL THEN NULL ELSE '/api/v1/media/' || o.brand_logo_media_id::text || '/content' END,
	o.logo_url`

func scanBranding(row pgx.Row) (OrgBranding, error) {
	var item OrgBranding
	var legacy string
	err := row.Scan(&item.OrgID, &item.Name, &item.Slogan, &item.LogoMediaID, &item.LogoURL, &legacy)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return OrgBranding{}, ErrNotFound
		}
		return OrgBranding{}, err
	}
	item.LegacyLogoURL = legacy
	return item, nil
}

// GetBranding loads the (single-organisation) branding profile.
func (s *Store) GetBranding(ctx context.Context) (OrgBranding, error) {
	item, err := scanBranding(s.pool.QueryRow(ctx, `
		SELECT `+brandingColumns+`
		FROM organizations o
		WHERE o.status = 'active'
		ORDER BY o.created_at
		LIMIT 1`))
	if err != nil {
		return OrgBranding{}, fmt.Errorf("get branding: %w", err)
	}
	return item, nil
}

// UpdateBranding edits name, slogan and the logo media reference. An empty
// logoMediaID clears the logo.
func (s *Store) UpdateBranding(ctx context.Context, orgID, name, slogan, logoMediaID string) (OrgBranding, error) {
	item, err := scanBranding(s.pool.QueryRow(ctx, `
		UPDATE organizations o
		SET name = $2, brand_slogan = $3,
			brand_logo_media_id = NULLIF($4, '')::uuid,
			updated_at = now()
		WHERE o.id = $1::uuid
		RETURNING `+brandingColumns, orgID, name, slogan, logoMediaID))
	if err != nil {
		return OrgBranding{}, fmt.Errorf("update branding: %w", err)
	}
	return item, nil
}
