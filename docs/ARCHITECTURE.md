# MITS Platform Architecture Documentation

## 1. System Overview & Architectural Style

The **MITS Student Login and Coding Challenge Platform** is built following a **modular, layered architecture** using Node.js, Express, and PostgreSQL. It enforces strict separation of concerns across presentation, routing, validation, business domain logic, and data access.

```
                           +----------------------+
                           |   HTTP / HTTPS       |
                           +----------------------+
                                      |
                                      v
                      +--------------------------------+
                      |   Express Application Pipeline  |
                      |   - nosniff & security headers |
                      |   - requestLogger middleware   |
                      |   - json body parser (256KB)   |
                      +--------------------------------+
                                      |
                     +----------------+----------------+
                     |                                 |
                     v                                 v
          +---------------------+            +---------------------+
          |  Static Assets      |            |  API Routes         |
          |  (HTML, CSS, JS)    |            |  - /api/login       |
          +---------------------+            |  - /api/attempt     |
                                             |  - /api/admin/*     |
                                             +---------------------+
                                                       |
                                                       v
                                             +---------------------+
                                             | Request Validation  |
                                             | & Auth Middleware   |
                                             +---------------------+
                                                       |
                                                       v
                                             +---------------------+
                                             | Feature Controllers |
                                             +---------------------+
                                                       |
                                                       v
                                             +---------------------+
                                             | Business Services   |
                                             +---------------------+
                                                       |
                                                       v
                                             +---------------------+
                                             | Data Repositories   |
                                             +---------------------+
                                                       |
                                                       v
                                             +---------------------+
                                             | PostgreSQL Pool     |
                                             | (pg.Pool / ACID Tx) |
                                             +---------------------+
```

---

## 2. Directory Layout & Module Organization

```text
gmocs/
├── server.js                     # Root runtime entrypoint (delegates to src/server.js)
├── manage.js                     # Administrative CLI tool (PostgreSQL-backed)
├── level3Runner.js               # Multi-tier local/remote Level 3 execution engine
├── content.json                  # Version-controlled question & pattern definitions
├── package.json                  # Dependencies (Express 5, pg, xlsx, dotenv)
├── Dockerfile                    # Multi-language compiler container image (non-root)
├── .env.example                  # Environment configuration template
├── README.md                     # Beginner-friendly setup and deployment manual
│
├── src/
│   ├── app.js                    # Express application factory, routing & middleware pipeline
│   ├── server.js                 # Server lifecycle, database migrations & graceful shutdown
│   │
│   ├── config/
│   │   ├── env.js                # Environment configuration loading & validation
│   │   ├── database.js           # PostgreSQL connection pool & transaction runner
│   │   ├── logger.js             # Structured console logger with ISO timestamps
│   │   └── security.js           # HTTP headers & cookie management
│   │
│   ├── modules/
│   │   ├── auth/                 # Student and administrator authentication
│   │   │   ├── auth.routes.js
│   │   │   ├── auth.controller.js
│   │   │   ├── auth.service.js
│   │   │   ├── auth.repository.js
│   │   │   └── auth.validation.js
│   │   │
│   │   ├── students/             # Student roster CRUD, Excel template, import & export
│   │   │   ├── students.routes.js
│   │   │   ├── students.controller.js
│   │   │   ├── students.service.js
│   │   │   ├── students.repository.js
│   │   │   └── students.validation.js
│   │   │
│   │   ├── exams/                # Exam levels, progression rules & PIN verification
│   │   │   ├── exams.service.js
│   │   │   └── ...
│   │   │
│   │   ├── attempts/             # Exam attempts, autosave, anti-cheating, submission
│   │   │   ├── attempts.routes.js
│   │   │   ├── attempts.controller.js
│   │   │   ├── attempts.service.js
│   │   │   └── attempts.repository.js
│   │   │
│   │   ├── questions/            # Level 1/2 regex/VM evaluators & Level 3 runner integration
│   │   │   ├── questions.evaluator.js
│   │   │   ├── questions.service.js
│   │   │   └── questions.repository.js
│   │   │
│   │   ├── results/              # Leaderboard & cohort dashboard aggregations
│   │   │   ├── results.controller.js
│   │   │   └── results.service.js
│   │   │
│   │   └── admin/                # Administrator runner status and operational routes
│   │       ├── admin.routes.js
│   │       └── admin.controller.js
│   │
│   ├── middleware/
│   │   ├── authenticate.js       # Student & admin session cookie verification
│   │   ├── authorize.js          # Role-based access control
│   │   ├── validateRequest.js    # Schema validation wrapper
│   │   ├── errorHandler.js       # Centralized Express error handler
│   │   ├── notFound.js           # SPA static fallback and 404 handler
│   │   ├── rateLimiter.js        # IP rate limiter for sensitive endpoints
│   │   └── requestLogger.js      # Structured HTTP request logger
│   │
│   ├── database/
│   │   ├── migrate.js            # Transactional database migration runner
│   │   ├── schema/               # Ordered SQL schema migration scripts
│   │   └── seeds/                # Seed utilities for development and testing
│   │
│   └── shared/
│       ├── errors/               # AppError class and standard error codes
│       ├── utils/                # Crypto, date, and math utilities
│       ├── constants/            # Exam durations, scores, and cookie names
│       └── validators/           # Shared roll number and year normalization
│
├── static/                       # SPA frontend (HTML, CSS, JS, branding)
├── scripts/                      # Deployment and data migration utilities
├── docs/                         # System documentation and manuals
└── tests/                        # Automated unit, integration, and regression tests
```

---

## 3. Layer Responsibilities & Design Patterns

### 3.1 Routes Layer (`*.routes.js`)
- Declares HTTP methods and endpoint paths.
- Chains security, rate limiting, validation, and authentication middlewares.
- Attaches controller methods.
- **Rules**: Zero database queries, business rules, or marks calculations.

### 3.2 Controllers Layer (`*.controller.js`)
- Extracts request parameters, query string parameters, cookies, and JSON payloads.
- Invokes domain services.
- Formats HTTP responses (status code, headers, JSON body).
- Forwards caught exceptions to `next(error)` for centralized handling.
- **Rules**: Controllers never communicate directly with the database.

### 3.3 Services Layer (`*.service.js`)
- Encapsulates all business logic:
  - Linear exam level unlock and completion logic.
  - Secret PIN verification with timing-safe comparison.
  - Grading algorithms and test case evaluation.
  - PBKDF2 password hashing and verification.
  - Question pair assignment and rotation.
- **Rules**: Services orchestrate repositories and never write raw SQL.

### 3.4 Repositories Layer (`*.repository.js`)
- Only application layer that connects to PostgreSQL.
- Executes parameterized SQL queries using the connection pool.
- Manages transactions (`withTransaction`) for atomic multi-write workflows.
- Maps database rows to domain models.
- **Rules**: No HTTP concepts (`req`, `res`) exist in repositories.

---

## 4. Database Concurrency & Transaction Management

The application reuses a high-performance connection pool (`pg.Pool`) configured with 20 maximum connections and automatic connection reclamation.

### Transaction Boundaries
Multi-step mutations execute inside managed database transactions:
1. **Attempt Submission (`submitAttempt`)**: Answer saving, test case grading, and status transition to `submitted` execute atomically.
2. **Student Deletion**: Cascading foreign keys (`ON DELETE CASCADE`) guarantee sessions, attempts, and assignments are purged cleanly without leaving orphaned records.
3. **Database Migrations (`migrate.js`)**: All pending schema migration files execute inside a single transaction; any syntax or execution error triggers immediate rollback.

---

## 5. Security Architecture

1. **Password Storage**: Passwords are never stored in plaintext. They are hashed using PBKDF2 with SHA-256, 310,000 iterations, and a unique 16-byte cryptographically secure salt.
2. **Session Cookies**: Tokens are 32-byte base64url random values. The server stores only the SHA-256 hash of the token in PostgreSQL. Cookies are configured with `HttpOnly`, `SameSite=strict`, and `Secure` (in HTTPS production).
3. **Timing-Safe Comparison**: Passwords and exam access PINs are verified using `crypto.timingSafeEqual` to eliminate timing side-channel attacks.
4. **Parameterized Queries**: All database queries use `$1, $2, ...` query placeholders to prevent SQL injection.
5. **Rate Limiting**: Authentication endpoints are protected by an in-memory sliding window rate limiter to thwart brute force attacks.
