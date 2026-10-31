-- v0.4: exam staff assignment, review rounds and notification dedupe.

CREATE TABLE IF NOT EXISTS exam_proctors (
    exam_id    uuid NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (exam_id, user_id)
);

CREATE TABLE IF NOT EXISTS exam_reviewers (
    exam_id    uuid NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (exam_id, user_id)
);

ALTER TABLE review_tasks
    ADD COLUMN round smallint NOT NULL DEFAULT 1 CHECK (round BETWEEN 1 AND 3);

CREATE UNIQUE INDEX IF NOT EXISTS ux_review_tasks_round
    ON review_tasks (attempt_id, question_id, round);

ALTER TABLE notifications
    ADD COLUMN source_type text NOT NULL DEFAULT '',
    ADD COLUMN source_id text NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS ux_notifications_source
    ON notifications (user_id, source_type, source_id)
    WHERE source_type <> '';
