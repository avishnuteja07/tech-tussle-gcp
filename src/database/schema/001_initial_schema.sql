-- =============================================================================
-- Initial PostgreSQL Schema for GMOCS (MITS Examination Platform)
-- Clean relational design without historical legacy structures
-- =============================================================================

-- 1. Students
CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,
    registration_number VARCHAR(10) UNIQUE NOT NULL,
    full_name VARCHAR(120),
    study_year SMALLINT NOT NULL CHECK (study_year IN (1, 2, 3)),
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_students_reg ON students(registration_number);
CREATE INDEX IF NOT EXISTS idx_students_year ON students(study_year);

-- 2. Administrators
CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    username VARCHAR(80) UNIQUE NOT NULL,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    managed_by_env BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_admins_username ON admins(username);

-- 3. Student Active Sessions
CREATE TABLE IF NOT EXISTS student_sessions (
    token_hash VARCHAR(64) PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    study_year SMALLINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_student_sessions_student_id ON student_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_student_sessions_expires_at ON student_sessions(expires_at);

-- 4. Admin Active Sessions
CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash VARCHAR(64) PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON admin_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at);

-- 5. Exam Attempts
CREATE TABLE IF NOT EXISTS exam_attempts (
    id SERIAL PRIMARY KEY,
    attempt_id VARCHAR(64) UNIQUE NOT NULL,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    study_year SMALLINT NOT NULL,
    level SMALLINT NOT NULL CHECK (level IN (1, 2, 3)),
    started_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,
    questions JSONB NOT NULL,
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    grades JSONB NOT NULL DEFAULT '{}'::jsonb,
    case_grades JSONB NOT NULL DEFAULT '{}'::jsonb,
    level3_runs JSONB NOT NULL DEFAULT '{}'::jsonb,
    integrity_violations SMALLINT NOT NULL DEFAULT 0,
    last_integrity_violation VARCHAR(32),
    last_integrity_violation_at BIGINT,
    submitted_at BIGINT,
    submit_reason VARCHAR(32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_attempts_student_active 
  ON exam_attempts(student_id, study_year, level, submitted_at, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_level_submitted 
  ON exam_attempts(level, submitted_at DESC);

-- 6. Level 3 Question Pair Assignments
CREATE TABLE IF NOT EXISTS level3_assignments (
    student_id INTEGER PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
    question_ids JSONB NOT NULL,
    cycle INTEGER NOT NULL DEFAULT 0,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. System Settings (Rotation state, pair order, runtime counters)
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(64) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
