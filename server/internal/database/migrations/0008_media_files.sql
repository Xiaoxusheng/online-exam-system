-- Media storage: one table for every uploaded binary (question assets, candidate
-- audio/video answers, branding logos, proctor snapshots). Files live on disk under
-- MEDIA_DIR; only metadata lands here. status keeps a soft-delete trail for audit.

CREATE TABLE IF NOT EXISTS media_files (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    uploader_id uuid REFERENCES users (id) ON DELETE SET NULL,
    purpose     text NOT NULL CHECK (purpose IN ('question_asset', 'answer_media', 'branding', 'proctor_snapshot', 'other')),
    filename    text NOT NULL,
    mime        text NOT NULL,
    size_bytes  bigint NOT NULL CHECK (size_bytes >= 0),
    sha256      text NOT NULL DEFAULT '',
    storage_key text NOT NULL UNIQUE,
    status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_media_files_org_purpose ON media_files (org_id, purpose, status);
CREATE INDEX IF NOT EXISTS idx_media_files_uploader ON media_files (uploader_id, created_at DESC);
