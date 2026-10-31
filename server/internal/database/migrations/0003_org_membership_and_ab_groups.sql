-- v0.3: user membership and AB paper groups for candidates/attempts.

ALTER TABLE users
    ADD COLUMN campus_id uuid REFERENCES campuses (id) ON DELETE SET NULL,
    ADD COLUMN class_id uuid REFERENCES classes (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_campus ON users (campus_id);
CREATE INDEX IF NOT EXISTS idx_users_class ON users (class_id);

ALTER TABLE exam_candidates
    ADD COLUMN paper_group text NOT NULL DEFAULT 'A' CHECK (paper_group IN ('A', 'B'));

ALTER TABLE attempts
    ADD COLUMN paper_group text NOT NULL DEFAULT 'A' CHECK (paper_group IN ('A', 'B'));
