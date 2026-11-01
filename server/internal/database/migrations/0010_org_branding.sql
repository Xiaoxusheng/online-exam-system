-- Organization branding (A-05): logo now references the media store, plus a
-- login-page slogan. The legacy logo_url column stays untouched for history.

ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS brand_logo_media_id uuid REFERENCES media_files (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS brand_slogan text NOT NULL DEFAULT '';
