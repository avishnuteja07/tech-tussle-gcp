# GMOCS Platform Audit & Rebuild Specification

## 1. Executive Summary

This audit assesses the **GMOCS / MITS Student Login and Coding Challenge Platform**, an online examination system designed to conduct secure, timed assessments across three levels:
1. **Level 1 (Bug Smash)**: 15-minute diagnostic debugging challenge evaluated via regex pattern heuristics.
2. **Level 2 (Code Rescue)**: 25-minute interactive frontend and DOM challenge (Traffic Signal, Daily Water Tracker, CSS Profile Card) evaluated using regex heuristics and Node.js VM execution.
3. **Level 3 (Algorithm Challenge)**: 30-minute programming competition assigning pairs from an 8-problem pool, evaluated in 6 languages (Python, JavaScript, C, C++, C#, Java) using a hybrid local/remote execution engine.

The platform has been rebuilt into a clean, modular, layered architecture backed exclusively by **PostgreSQL**, targeting deployment on a single Google Cloud Compute Engine VM (Ubuntu 24.04 LTS). No historical database records, legacy SQLite files, or MongoDB databases are imported or retained.

---

## 2. Architecture & File Structure

### 2.1 File Organization
- **`src/app.js`**: Express application factory encapsulating HTTP middlewares, security headers (`nosniff`, `same-origin`, `no-store`), static asset serving, and module route registration.
- **`src/server.js`**: Server lifecycle manager responsible for environment validation, schema initialization, administrator bootstrapping, and graceful shutdown.
- **`src/config/`**:
  - `database.js`: PostgreSQL connection pool management (`pg.Pool`) and atomic transaction runner (`withTransaction`).
  - `env.js`: Environment configuration loading and strict startup validation.
  - `logger.js`: Structured logger with ISO timestamps and log levels.
  - `security.js`: Cookie helpers and security header management.
- **`src/modules/`**:
  - `auth`: Student and administrator authentication, PBKDF2 password hashing, and session tokens.
  - `students`: Student roster management, individual CRUD, Excel export, and bulk `.xlsx` import.
  - `exams`: Progression tracking, level unlock state, and PIN verification.
  - `attempts`: Attempt creation, answer autosaving, anti-cheating violation tracking, and final submission.
  - `questions`: Level 1 and Level 2 evaluators, Level 3 problem lookup, and runner orchestration.
  - `results`: Public leaderboard and administrator cohort analytics.
  - `admin`: Operational dashboard and runner status.
- **`level3Runner.js`**:
  - High-performance multi-tier code execution engine: local native compilers (`python3`, `node`, `gcc`, `g++`, `csc`/`mono`, `javac`/`java`) with seamless remote fallback to Judge0.
- **`manage.js`**:
  - Administrative CLI tool backed by PostgreSQL for managing accounts and attempts from the terminal.
- **`content.json`**:
  - Version-controlled challenge questions, starter code, test suites, and pattern heuristics.

---

## 3. Application Features & Rules

1. **Student Authentication & Sessions**:
   - Registration numbers: exactly 10 alphanumeric characters (`/^[A-Z0-9]{10}$/`).
   - Study years: 1, 2, or 3 (`I`, `II`, `III`).
   - Default student password: `tech@123`.
   - Passwords hashed using PBKDF2-SHA256 (310,000 iterations, 32-byte key, 16-byte random salt).
   - Sessions: 7-day duration; session cookie `mits_l1_sid` with SHA-256 token hashing.

2. **Administrator Authentication & Management**:
   - Username (1-80 chars) and password (8-1024 chars).
   - Environment-bootstrapped admin via `ADMIN_USERNAME` and `ADMIN_PASSWORD`, or interactive setup via `manage.js add-admin`.
   - Sessions: 8-hour duration; session cookie `mits_l1_admin`.
   - Live dashboard with cohort statistics (registered, logged in, attempted, completed, in-progress, question distribution).
   - Public leaderboard showing top 50 scores.
   - Full student roster management: add, edit, delete (with cascade purge), Excel export, template download, and Excel bulk import.

3. **Level Progression & Rules**:
   - **Linear progression**: Level 1 must be completed to unlock Level 2; Level 2 must be completed to unlock Level 3; Level 3 completion locks all levels.
   - **PIN protection**: Starting/resuming Level 2 requires `LEVEL_2_PIN`; starting/resuming Level 3 requires `LEVEL_3_PIN`.
   - **Timing**: Level 1 = 900s (15 min), Level 2 = 1500s (25 min), Level 3 = 1800s (30 min).

4. **Scoring Rules**:
   - **Level 1**: 4 tasks. Year 1 selects 1 question per task; Years 2 and 3 get 1 randomized question per task. 5 marks per correct answer (20 marks max).
   - **Level 2**: 3 tasks (Traffic, Water, CSS). 5 test cases per task, 2 marks per test case (30 marks max).
   - **Level 3**: 2 questions assigned from 28 unique pairs. 5 test cases per question (2 public, 3 hidden), 5 marks per passed test (50 marks max).
   - Max exam score: 20 + 30 + 50 = 100 marks.

5. **Anti-Cheating / Integrity Violations**:
   - Client tracks tab switches and fullscreen exits (`/api/attempt-violation`).
   - Recorded in attempt: `integrityViolations`, `lastIntegrityViolation`, `lastIntegrityViolationAt`.
   - On 3rd violation, exam is automatically submitted with `submitReason: 'tab_switch'`.

---

## 4. PostgreSQL Relational Model

The database is built entirely on PostgreSQL with normalized entities, foreign keys, cascades, and indexes:
- `students`: Student accounts and authentication credentials.
- `admins`: Administrator accounts and credentials.
- `student_sessions`: Active student sessions linked to cookies.
- `admin_sessions`: Active administrator sessions linked to cookies.
- `exam_attempts`: Exam sessions, snapshots of questions, answers, grades, test runs, and violations.
- `level3_assignments`: Deterministic question pair assignments.
- `system_settings`: Key-value configuration for rotation order and counters.
- `schema_migrations`: Versioned SQL migration tracking.
