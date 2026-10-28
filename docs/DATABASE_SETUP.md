# PostgreSQL Database Setup Guide

This document describes how to set up, initialize, and configure the clean **PostgreSQL** database for the **GMOCS / MITS Student Login and Coding Challenge Platform**.

---

## 1. Prerequisites

- **PostgreSQL Server**: PostgreSQL 14+ (PostgreSQL 16 recommended).
- **Node.js**: Node.js 22.13.0 LTS or newer.
- **npm**: npm 10+.

---

## 2. Step 1: Create the Database & Dedicated User

Connect to PostgreSQL as the `postgres` superuser:

```bash
sudo -u postgres psql
```

Inside the `psql` console, run:

```sql
-- 1. Create the application database
CREATE DATABASE mits_login;

-- 2. Create dedicated application user with strong password
CREATE USER mits_admin WITH ENCRYPTED PASSWORD 'ChooseAStrongPassword123!';

-- 3. Grant privileges to the application user
GRANT ALL PRIVILEGES ON DATABASE mits_login TO mits_admin;
ALTER DATABASE mits_login OWNER TO mits_admin;

-- 4. Switch to mits_login and grant schema permissions
\c mits_login
GRANT ALL ON SCHEMA public TO mits_admin;

-- 5. Exit psql
\q
```

---

## 3. Step 2: Configure Environment Variables

Create or edit `.env` in the project root:

```bash
cp .env.example .env
```

Set `DATABASE_URL` to the credentials created above:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
COOKIE_SECURE=false

# Dedicated application database user
DATABASE_URL=postgresql://mits_admin:ChooseAStrongPassword123!@127.0.0.1:5432/mits_login

# Optional: Initial administrator bootstrap credentials
# When both variables are set, the application creates or updates this admin on startup.
ADMIN_USERNAME=exam_admin
ADMIN_PASSWORD=AdminSecurePassword2026!

# Exam Level Access PINs
LEVEL_2_PIN=8192
LEVEL_3_PIN=4096

# Level 3 Code Execution
RUNNER_PREFERENCE=local,remote
```

Protect file permissions on Linux:
```bash
chmod 600 .env
```

---

## 4. Step 3: Run Database Migrations (Schema Initialization)

Run the SQL migration runner to create all required tables, constraints, sequences, and indexes:

```bash
npm run migrate
```

Verify that the schema was applied:
```bash
node src/database/migrate.js --status
```

Expected output:
```text
Migration Status:
-----------------------------------------
[X] 001_initial_schema.sql
-----------------------------------------
```

The database now contains:
- `students`
- `admins`
- `student_sessions`
- `admin_sessions`
- `exam_attempts`
- `level3_assignments`
- `system_settings`
- `schema_migrations`

---

## 5. Step 4: Create the First Administrator

You can create administrators in two ways:

### Method A: Interactive Command Line (Recommended)
Run the administrative CLI tool:

```bash
node manage.js add-admin <admin_username>
```

You will be prompted to enter a password securely (minimum 8 characters):
```text
Admin password (minimum 8 characters): ********
Added administrator myadmin.
```
The password is automatically hashed using PBKDF2-SHA256 with 310,000 iterations and a cryptographically secure 16-byte random salt.

### Method B: Environment Variable Bootstrap
Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.env`. On server startup (`npm start`), the platform automatically provisions or updates the configured administrator.

---

## 6. Step 5: Start the Application

```bash
npm start
```

The application starts on the configured `PORT` and `HOST`. Verify the health endpoint:

```bash
curl http://127.0.0.1:3000/health
```

Expected response:
```json
{"ok":true,"status":"healthy","timestamp":"2026-10-28T16:30:00.000Z"}
```

---

## 7. Optional: Development Seed Data

For local testing in `NODE_ENV=development`:

```bash
npm run seed:dev
```

This seeds 3 sample student accounts (`21691A0501`, `21691A0502`, `21691A0503`) with password `tech@123`.

> **Note**: `seed:dev` is strictly blocked in production mode (`NODE_ENV=production`) to prevent inserting dummy records into live environments.
