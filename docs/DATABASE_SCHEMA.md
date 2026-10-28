# PostgreSQL Database Schema Documentation

This document describes the clean relational database schema for the **GMOCS / MITS Student Login and Coding Challenge Platform** (`mits_login`).

---

## 1. Schema Entity-Relationship Diagram

```
                      +-------------------+
                      |      admins       |
                      +-------------------+
                                | 1
                                | has many
                                v *
                      +-------------------+
                      |  admin_sessions   |
                      +-------------------+

                      +-------------------+
                      |     students      |
                      +-------------------+
                        | 1          | 1          | 1
                        | has many   | has many   | has one
                        v *          v *          v 1
               +----------------+  +---------------+  +---------------------+
               |student_sessions|  | exam_attempts |  | level3_assignments  |
               +----------------+  +---------------+  +---------------------+

                      +-------------------+
                      |  system_settings  |
                      +-------------------+

                      +-------------------+
                      | schema_migrations |
                      +-------------------+
```

---

## 2. Table Specifications

### 2.1 `students`
Stores registered student accounts, authentication salts/hashes, and year of study.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `SERIAL` | `PRIMARY KEY` | Unique relational identifier |
| `registration_number` | `VARCHAR(10)` | `UNIQUE NOT NULL` | Uppercase 10-character alphanumeric registration roll number |
| `full_name` | `VARCHAR(120)` | `NULL` | Student's display name (defaults to registration number) |
| `study_year` | `SMALLINT` | `NOT NULL CHECK (study_year IN (1, 2, 3))` | Student's cohort year (1 = I, 2 = II, 3 = III) |
| `password_salt` | `TEXT` | `NOT NULL` | Base64-encoded 16-byte cryptographically secure random salt |
| `password_hash` | `TEXT` | `NOT NULL` | Base64-encoded PBKDF2-SHA256 (310,000 iterations) hash |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NULL` | Timestamp of last record update |

**Indexes**:
- `idx_students_reg` on `registration_number` (B-tree)
- `idx_students_year` on `study_year` (B-tree)

---

### 2.2 `admins`
Stores administrator credentials.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `SERIAL` | `PRIMARY KEY` | Unique relational administrator identifier |
| `username` | `VARCHAR(80)` | `UNIQUE NOT NULL` | Administrator username |
| `password_salt` | `TEXT` | `NOT NULL` | Base64-encoded 16-byte random salt |
| `password_hash` | `TEXT` | `NOT NULL` | Base64-encoded PBKDF2-SHA256 hash |
| `managed_by_env` | `BOOLEAN` | `NOT NULL DEFAULT FALSE` | True if provisioned via `ADMIN_USERNAME` / `ADMIN_PASSWORD` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NULL` | Last credential update timestamp |

**Indexes**:
- `idx_admins_username` on `username` (B-tree)

---

### 2.3 `student_sessions`
Active student sessions mapped to browser cookies (`mits_l1_sid`).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `token_hash` | `VARCHAR(64)` | `PRIMARY KEY` | SHA-256 hex digest of the base64url session token |
| `student_id` | `INTEGER` | `NOT NULL REFERENCES students(id) ON DELETE CASCADE` | Associated student |
| `study_year` | `SMALLINT` | `NOT NULL` | Session cohort year |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Session issue timestamp |
| `last_seen` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Heartbeat / active session tracking |
| `expires_at` | `TIMESTAMPTZ` | `NOT NULL` | Absolute expiration date (7 days from issue) |

**Indexes**:
- `idx_student_sessions_student_id` on `student_id`
- `idx_student_sessions_expires_at` on `expires_at`

---

### 2.4 `admin_sessions`
Active administrator sessions mapped to cookies (`mits_l1_admin`).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `token_hash` | `VARCHAR(64)` | `PRIMARY KEY` | SHA-256 hex digest of the administrator session token |
| `admin_id` | `INTEGER` | `NOT NULL REFERENCES admins(id) ON DELETE CASCADE` | Associated administrator |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Session issue timestamp |
| `expires_at` | `TIMESTAMPTZ` | `NOT NULL` | Expiration date (8 hours from issue) |

**Indexes**:
- `idx_admin_sessions_admin_id` on `admin_id`
- `idx_admin_sessions_expires_at` on `expires_at`

---

### 2.5 `exam_attempts`
Records examination sessions, randomized questions, autosaved answers, integrity violations, and scores.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `SERIAL` | `PRIMARY KEY` | Relational attempt key |
| `attempt_id` | `VARCHAR(64)` | `UNIQUE NOT NULL` | Base64url random identifier used in client APIs |
| `student_id` | `INTEGER` | `NOT NULL REFERENCES students(id) ON DELETE CASCADE` | Attempt owner |
| `study_year` | `SMALLINT` | `NOT NULL` | Student year when attempt was initiated |
| `level` | `SMALLINT` | `NOT NULL CHECK (level IN (1, 2, 3))` | Exam Level (1 = Bug Smash, 2 = Code Rescue, 3 = Coding Challenge) |
| `started_at` | `BIGINT` | `NOT NULL` | Unix epoch seconds when attempt began |
| `expires_at` | `BIGINT` | `NOT NULL` | Unix epoch seconds when attempt expires |
| `questions` | `JSONB` | `NOT NULL` | Snapshot of assigned tasks/questions |
| `answers` | `JSONB` | `NOT NULL DEFAULT '{}'` | Map of question ID to submitted answer |
| `grades` | `JSONB` | `NOT NULL DEFAULT '{}'` | Map of question ID to boolean correctness |
| `case_grades` | `JSONB` | `NOT NULL DEFAULT '{}'` | Map of question ID to boolean array of passed tests |
| `level3_runs` | `JSONB` | `NOT NULL DEFAULT '{}'` | Verifier execution metadata and cache fingerprints |
| `integrity_violations` | `SMALLINT` | `NOT NULL DEFAULT 0` | Count of tab-switch / fullscreen-exit events |
| `last_integrity_violation` | `VARCHAR(32)` | `NULL` | Reason for latest violation ('tab_switch' / 'fullscreen_exit') |
| `last_integrity_violation_at` | `BIGINT` | `NULL` | Epoch seconds of latest violation |
| `submitted_at` | `BIGINT` | `NULL` | Epoch seconds when submitted (NULL while in progress) |
| `submit_reason` | `VARCHAR(32)` | `NULL` | Reason for completion ('manual', 'timer', 'tab_switch') |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record insertion timestamp |

**Indexes**:
- `idx_exam_attempts_student_active` on `(student_id, study_year, level, submitted_at, started_at DESC)`
- `idx_exam_attempts_level_submitted` on `(level, submitted_at DESC)`

---

### 2.6 `level3_assignments`
Stores deterministic question pairs assigned to each student for Level 3.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `student_id` | `INTEGER` | `PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE` | Assigned student |
| `question_ids` | `JSONB` | `NOT NULL` | Array of 2 question IDs |
| `cycle` | `INTEGER` | `NOT NULL DEFAULT 0` | Round-robin rotation cycle count |
| `assigned_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Assignment timestamp |

---

### 2.7 `system_settings`
Key-value store for application configuration and runtime counters.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `key` | `VARCHAR(64)` | `PRIMARY KEY` | Configuration identifier |
| `value` | `JSONB` | `NOT NULL` | JSON configuration payload |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last update timestamp |

---

### 2.8 `schema_migrations`
Tracks executed database migrations.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `SERIAL` | `PRIMARY KEY` | Sequential execution order |
| `name` | `VARCHAR(255)` | `UNIQUE NOT NULL` | Migration filename (e.g. `001_initial_schema.sql`) |
| `applied_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Timestamp when migration was applied |
