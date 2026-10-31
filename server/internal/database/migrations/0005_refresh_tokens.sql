-- Refresh tokens are stored as SHA-256 hashes; rotation revokes the previous row so a
-- replayed token can be detected and the whole session family revoked.
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash  text NOT NULL UNIQUE,
    user_agent  text NOT NULL DEFAULT '',
    ip          text NOT NULL DEFAULT '',
    expires_at  timestamptz NOT NULL,
    revoked_at  timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id, expires_at DESC);
