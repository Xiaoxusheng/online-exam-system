package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// MediaFile is one uploaded binary. Bytes live on disk (storage_key maps to a path
// under MEDIA_DIR); the row carries metadata, ownership and the soft-delete trail.
type MediaFile struct {
	ID         string    `json:"id"`
	OrgID      string    `json:"org_id"`
	UploaderID string    `json:"uploader_id"`
	Purpose    string    `json:"purpose"`
	Filename   string    `json:"filename"`
	Mime       string    `json:"mime"`
	SizeBytes  int64     `json:"size_bytes"`
	SHA256     string    `json:"sha256"`
	StorageKey string    `json:"-"`
	Status     string    `json:"status"`
	CreatedAt  time.Time `json:"created_at"`
}

const mediaColumns = `id::text, org_id::text, COALESCE(uploader_id::text, ''), purpose, filename, mime,
	size_bytes, sha256, storage_key, status, created_at`

func scanMediaFile(row pgx.Row) (MediaFile, error) {
	var item MediaFile
	err := row.Scan(&item.ID, &item.OrgID, &item.UploaderID, &item.Purpose, &item.Filename,
		&item.Mime, &item.SizeBytes, &item.SHA256, &item.StorageKey, &item.Status, &item.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return MediaFile{}, ErrNotFound
		}
		return MediaFile{}, err
	}
	return item, nil
}

func (s *Store) CreateMediaFile(ctx context.Context, item MediaFile) (MediaFile, error) {
	created, err := scanMediaFile(s.pool.QueryRow(ctx, `
		INSERT INTO media_files (org_id, uploader_id, purpose, filename, mime, size_bytes, sha256, storage_key)
		VALUES ($1::uuid, NULLIF($2, '')::uuid, $3, $4, $5, $6, $7, $8)
		RETURNING `+mediaColumns,
		item.OrgID, item.UploaderID, item.Purpose, item.Filename, item.Mime,
		item.SizeBytes, item.SHA256, item.StorageKey))
	if err != nil {
		return MediaFile{}, fmt.Errorf("create media file: %w", err)
	}
	return created, nil
}

// GetMediaFile loads one active file. Org tenancy is enforced here; caller-side
// role checks (who may open answer_media / proctor_snapshot) stay in the handler.
func (s *Store) GetMediaFile(ctx context.Context, orgID, id string) (MediaFile, error) {
	item, err := scanMediaFile(s.pool.QueryRow(ctx, `
		SELECT `+mediaColumns+`
		FROM media_files
		WHERE id = $1::uuid AND org_id = $2::uuid AND status = 'active'`, id, orgID))
	if err != nil {
		return MediaFile{}, fmt.Errorf("get media file: %w", err)
	}
	return item, nil
}

// GetMediaFileByID loads one active file without the org filter. Only the
// branding handler uses it (public logos must resolve before login); every
// other purpose re-checks tenancy against the caller's claims.
func (s *Store) GetMediaFileByID(ctx context.Context, id string) (MediaFile, error) {
	item, err := scanMediaFile(s.pool.QueryRow(ctx, `
		SELECT `+mediaColumns+`
		FROM media_files
		WHERE id = $1::uuid AND status = 'active'`, id))
	if err != nil {
		return MediaFile{}, fmt.Errorf("get media file by id: %w", err)
	}
	return item, nil
}

// MarkMediaDeleted soft-deletes one file. The uploader or an org admin may call it;
// the handler resolves that rule before reaching here.
func (s *Store) MarkMediaDeleted(ctx context.Context, orgID, id, actorID string, actorAdmin bool) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE media_files SET status = 'deleted'
		WHERE id = $1::uuid AND org_id = $2::uuid AND status = 'active'
			AND ($3::bool OR COALESCE(uploader_id::text, '') = $4)`,
		id, orgID, actorAdmin, actorID)
	if err != nil {
		return fmt.Errorf("delete media file: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
