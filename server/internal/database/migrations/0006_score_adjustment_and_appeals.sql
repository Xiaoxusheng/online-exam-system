-- v1.0 score correction history and candidate score appeals.

CREATE TABLE IF NOT EXISTS score_adjustments (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    attempt_id    uuid NOT NULL REFERENCES attempts (id) ON DELETE CASCADE,
    before_total  numeric(8, 2) NOT NULL,
    after_total   numeric(8, 2) NOT NULL,
    reason        text NOT NULL,
    items         jsonb NOT NULL DEFAULT '[]'::jsonb,
    operator_id   uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_score_adjustments_attempt ON score_adjustments (attempt_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_score_adjustments_org_time ON score_adjustments (org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS score_appeals (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    attempt_id    uuid NOT NULL REFERENCES attempts (id) ON DELETE CASCADE,
    user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    question_id   uuid REFERENCES questions (id) ON DELETE SET NULL,
    reason        text NOT NULL,
    status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    handler_id    uuid REFERENCES users (id) ON DELETE SET NULL,
    handle_note   text NOT NULL DEFAULT '',
    handled_at    timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_score_appeals_status ON score_appeals (org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_score_appeals_user ON score_appeals (user_id, created_at DESC);
-- One open appeal per attempt (and per question once one is filed).
CREATE UNIQUE INDEX IF NOT EXISTS ux_score_appeals_open
    ON score_appeals (attempt_id, COALESCE(question_id::text, ''))
    WHERE status = 'pending';
