-- v0.1 baseline schema for online exam system (single organization, org_id reserved for future).

CREATE TABLE IF NOT EXISTS organizations (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    logo_url    text NOT NULL DEFAULT '',
    status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campuses (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    name        text NOT NULL,
    address     text NOT NULL DEFAULT '',
    status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (org_id, name)
);

CREATE TABLE IF NOT EXISTS classes (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    campus_id   uuid REFERENCES campuses (id) ON DELETE SET NULL,
    name        text NOT NULL,
    grade       text NOT NULL DEFAULT '',
    status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (org_id, name)
);

CREATE TABLE IF NOT EXISTS users (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id         uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    name           text NOT NULL,
    username       text NOT NULL,
    phone          text NOT NULL DEFAULT '',
    email          text NOT NULL DEFAULT '',
    password_hash  text NOT NULL,
    role           text NOT NULL CHECK (role IN ('org_admin', 'exam_admin', 'teacher', 'reviewer', 'proctor', 'student')),
    data_scope     text NOT NULL DEFAULT 'self' CHECK (data_scope IN ('org', 'campus', 'class', 'self')),
    status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    last_login_at  timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (org_id, username)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_org_phone ON users (org_id, phone) WHERE phone <> '';
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_org_email ON users (org_id, lower(email)) WHERE email <> '';
CREATE INDEX IF NOT EXISTS idx_users_org_role ON users (org_id, role);

CREATE TABLE IF NOT EXISTS question_banks (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    name        text NOT NULL,
    scope       text NOT NULL DEFAULT 'org',
    owner_id    uuid REFERENCES users (id) ON DELETE SET NULL,
    status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_question_banks_org ON question_banks (org_id, status);

CREATE TABLE IF NOT EXISTS questions (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id           uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    bank_id          uuid NOT NULL REFERENCES question_banks (id) ON DELETE CASCADE,
    type             text NOT NULL CHECK (type IN ('single', 'multiple', 'judge', 'fill', 'short', 'essay', 'programming', 'media')),
    knowledge_point  text NOT NULL DEFAULT '',
    difficulty       text NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
    content          jsonb NOT NULL DEFAULT '{}'::jsonb,
    answer           jsonb NOT NULL DEFAULT '{}'::jsonb,
    score_rule       jsonb NOT NULL DEFAULT '{}'::jsonb,
    default_score    numeric(6, 2) NOT NULL DEFAULT 0 CHECK (default_score >= 0),
    status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'published', 'archived')),
    version          integer NOT NULL DEFAULT 1 CHECK (version > 0),
    created_by       uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_questions_bank_status ON questions (bank_id, status);
CREATE INDEX IF NOT EXISTS idx_questions_org_type ON questions (org_id, type);
CREATE INDEX IF NOT EXISTS idx_questions_knowledge ON questions (org_id, knowledge_point);

CREATE TABLE IF NOT EXISTS question_assets (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id  uuid NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
    type         text NOT NULL CHECK (type IN ('image', 'audio', 'video', 'testcase', 'other')),
    url          text NOT NULL,
    meta         jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_question_assets_question ON question_assets (question_id);

CREATE TABLE IF NOT EXISTS question_revisions (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id  uuid NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
    version      integer NOT NULL,
    payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by   uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (question_id, version)
);

CREATE TABLE IF NOT EXISTS papers (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    type         text NOT NULL CHECK (type IN ('fixed', 'random', 'ab')),
    title        text NOT NULL,
    status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'archived')),
    total_score  numeric(8, 2) NOT NULL DEFAULT 0 CHECK (total_score >= 0),
    version      integer NOT NULL DEFAULT 1 CHECK (version > 0),
    rules        jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by   uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_papers_org_status ON papers (org_id, status);

CREATE TABLE IF NOT EXISTS paper_questions (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_id     uuid NOT NULL REFERENCES papers (id) ON DELETE CASCADE,
    question_id  uuid NOT NULL REFERENCES questions (id) ON DELETE RESTRICT,
    section      text NOT NULL DEFAULT '',
    sort_order   integer NOT NULL DEFAULT 0,
    score        numeric(6, 2) NOT NULL CHECK (score >= 0),
    paper_group  text NOT NULL DEFAULT 'A' CHECK (paper_group IN ('A', 'B')),
    UNIQUE (paper_id, paper_group, question_id)
);
CREATE INDEX IF NOT EXISTS idx_paper_questions_paper ON paper_questions (paper_id, sort_order);

CREATE TABLE IF NOT EXISTS exams (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id            uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    paper_id          uuid NOT NULL REFERENCES papers (id) ON DELETE RESTRICT,
    title             text NOT NULL,
    start_at          timestamptz NOT NULL,
    end_at            timestamptz NOT NULL,
    duration_minutes  integer NOT NULL CHECK (duration_minutes > 0),
    status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_publish', 'pending_start', 'in_progress', 'ended', 'grading', 'pending_publish_score', 'published', 'archived')),
    rules             jsonb NOT NULL DEFAULT '{}'::jsonb,
    proctor_config    jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by        uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CHECK (end_at > start_at)
);
CREATE INDEX IF NOT EXISTS idx_exams_org_status ON exams (org_id, status);
CREATE INDEX IF NOT EXISTS idx_exams_start_at ON exams (start_at);

CREATE TABLE IF NOT EXISTS paper_snapshots (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id     uuid NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
    paper_id    uuid NOT NULL REFERENCES papers (id) ON DELETE RESTRICT,
    payload     jsonb NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (exam_id)
);

CREATE TABLE IF NOT EXISTS exam_candidates (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id     uuid NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    ticket_no   text NOT NULL DEFAULT '',
    status      text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'waiting', 'testing', 'submitted', 'absent')),
    attempt_id  uuid,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (exam_id, user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_exam_candidates_ticket ON exam_candidates (exam_id, ticket_no) WHERE ticket_no <> '';
CREATE INDEX IF NOT EXISTS idx_exam_candidates_user ON exam_candidates (user_id, status);

CREATE TABLE IF NOT EXISTS attempts (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id       uuid NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
    user_id       uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    started_at    timestamptz NOT NULL DEFAULT now(),
    submitted_at  timestamptz,
    status        text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('not_started', 'waiting', 'in_progress', 'submitted', 'graded', 'published', 'voided')),
    score         numeric(8, 2),
    version       integer NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (exam_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_attempts_status ON attempts (status);

CREATE TABLE IF NOT EXISTS answers (
    attempt_id   uuid NOT NULL REFERENCES attempts (id) ON DELETE CASCADE,
    question_id  uuid NOT NULL REFERENCES questions (id) ON DELETE RESTRICT,
    content      jsonb NOT NULL DEFAULT '{}'::jsonb,
    version      integer NOT NULL DEFAULT 0,
    updated_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (attempt_id, question_id)
);

CREATE TABLE IF NOT EXISTS judge_results (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id   uuid NOT NULL REFERENCES attempts (id) ON DELETE CASCADE,
    question_id  uuid NOT NULL REFERENCES questions (id) ON DELETE RESTRICT,
    passed       integer NOT NULL DEFAULT 0,
    failed       integer NOT NULL DEFAULT 0,
    score        numeric(6, 2) NOT NULL DEFAULT 0,
    detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_judge_results_attempt ON judge_results (attempt_id, question_id);

CREATE TABLE IF NOT EXISTS review_tasks (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id   uuid NOT NULL REFERENCES attempts (id) ON DELETE CASCADE,
    question_id  uuid NOT NULL REFERENCES questions (id) ON DELETE RESTRICT,
    reviewer_id  uuid REFERENCES users (id) ON DELETE SET NULL,
    score        numeric(6, 2),
    comment      text NOT NULL DEFAULT '',
    status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'submitted', 'reviewed')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_review_tasks_status ON review_tasks (status);
CREATE INDEX IF NOT EXISTS idx_review_tasks_reviewer ON review_tasks (reviewer_id, status);
CREATE INDEX IF NOT EXISTS idx_review_tasks_attempt ON review_tasks (attempt_id);

CREATE TABLE IF NOT EXISTS proctor_events (
    id            bigserial PRIMARY KEY,
    exam_id       uuid NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
    attempt_id    uuid NOT NULL REFERENCES attempts (id) ON DELETE CASCADE,
    type          text NOT NULL,
    level         text NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warning', 'critical')),
    snapshot_url  text NOT NULL DEFAULT '',
    occurred_at   timestamptz NOT NULL DEFAULT now(),
    handled_by    uuid REFERENCES users (id) ON DELETE SET NULL,
    action        text NOT NULL DEFAULT '',
    note          text NOT NULL DEFAULT '',
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_proctor_events_exam ON proctor_events (exam_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_proctor_events_attempt ON proctor_events (attempt_id);

CREATE TABLE IF NOT EXISTS score_records (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id    uuid NOT NULL REFERENCES attempts (id) ON DELETE CASCADE,
    total         numeric(8, 2) NOT NULL DEFAULT 0,
    detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
    published_at  timestamptz,
    status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'withheld', 'corrected')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_score_records_attempt ON score_records (attempt_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
    id           bigserial PRIMARY KEY,
    org_id       uuid,
    actor_id     uuid,
    action       text NOT NULL,
    target_type  text NOT NULL DEFAULT '',
    target_id    text NOT NULL DEFAULT '',
    detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
    ip           text NOT NULL DEFAULT '',
    user_agent   text NOT NULL DEFAULT '',
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_time ON audit_logs (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_time ON audit_logs (actor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    channel     text NOT NULL DEFAULT 'inapp' CHECK (channel IN ('inapp', 'sms', 'email')),
    title       text NOT NULL,
    content     text NOT NULL DEFAULT '',
    status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'read')),
    sent_at     timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_templates (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    channel      text NOT NULL CHECK (channel IN ('inapp', 'sms', 'email')),
    code         text NOT NULL,
    title_tpl    text NOT NULL,
    content_tpl  text NOT NULL DEFAULT '',
    enabled      boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (org_id, code, channel)
);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'organizations', 'campuses', 'classes', 'users', 'question_banks', 'questions',
        'papers', 'exams', 'attempts', 'review_tasks', 'score_records', 'notification_templates'
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I', tbl, tbl);
        EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', tbl, tbl);
    END LOOP;
END;
$$;
