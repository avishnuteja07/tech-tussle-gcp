# MITS Platform API Documentation

## 1. General Conventions

- **Base URL**: `http://<host>:<port>`
- **Content-Type**: `application/json` (unless specified otherwise for binary downloads or uploads)
- **Response Format**: JSON objects containing payload properties or an `error` string on failure.
- **Authentication**: Stateful HTTP cookies:
  - Student: `mits_l1_sid`
  - Administrator: `mits_l1_admin`

---

## 2. Health & Status Endpoints

### `GET /health`
Healthcheck endpoint for container orchestration and uptime monitors.
- **Access**: Public
- **Response**: `200 OK`
```json
{
  "ok": true,
  "status": "healthy",
  "timestamp": "2026-10-28T16:00:00.000Z"
}
```

---

## 3. Student Authentication Endpoints

### `POST /api/login`
Authenticates a student and issues a session cookie.
- **Access**: Public (Rate-limited: 15 req/min)
- **Request Body**:
```json
{
  "registrationNumber": "21691A0501",
  "password": "tech@123",
  "studyYear": 1
}
```
- **Response**: `200 OK`
```json
{
  "ok": true,
  "registrationNumber": "21691A0501",
  "fullName": "21691A0501",
  "studyYear": 1
}
```
- **Error Responses**:
  - `400 Bad Request`: Missing credentials or invalid year.
  - `401 Unauthorized`: Invalid registration number or password.
  - `403 Forbidden`: Account registered under a different study year.

---

### `POST /api/logout`
Terminates the student session and destroys the cookie.
- **Access**: Student
- **Response**: `200 OK`
```json
{ "ok": true }
```

---

### `GET /api/me`
Retrieves current student session details and examination progress.
- **Access**: Public / Student
- **Response**: `200 OK`
```json
{
  "authenticated": true,
  "registrationNumber": "21691A0501",
  "fullName": "Student One",
  "studyYear": 1,
  "progress": {
    "level1Completed": true,
    "level2Completed": false,
    "level3Completed": false,
    "level1Unlocked": false,
    "level2Unlocked": true,
    "level3Unlocked": false
  }
}
```

---

## 4. Exam & Attempt Endpoints

### `GET /api/attempt`
Retrieves the student's active attempt or returns `null` if none is active.
- **Access**: Student
- **Query Parameters**: `?level=1|2|3` (optional)
- **Response**: `200 OK`
```json
{
  "attempt": {
    "id": "k19a_bc...",
    "level": 1,
    "expiresAt": 1730134800,
    "tasks": [...],
    "answers": {},
    "integrityViolations": 0,
    "submitted": false
  }
}
```

---

### `POST /api/start-attempt`
Starts a new attempt or resumes an ongoing attempt for the specified level.
- **Access**: Student
- **Request Body**:
```json
{
  "level": 2,
  "pin": "1234"
}
```
- **Response**: `200 OK`
```json
{
  "id": "k19a_bc...",
  "level": 2,
  "expiresAt": 1730136300,
  "tasks": [...],
  "answers": {},
  "studyYear": 1,
  "integrityViolations": 0,
  "marksPerAnswer": 10,
  "maxScore": 30
}
```
- **Error Responses**:
  - `400 Bad Request`: Invalid level.
  - `403 Forbidden`: Incorrect PIN or level is locked.
  - `409 Conflict`: Level is already completed and locked.
  - `503 Service Unavailable`: Level PIN is not configured on the server.

---

### `POST /api/save-attempt`
Debounced autosave of current answers while an attempt is in progress.
- **Access**: Student
- **Request Body**:
```json
{
  "attemptId": "k19a_bc...",
  "answers": {
    "c-1": "sum += n % 10",
    "traffic-1": "..."
  }
}
```
- **Response**: `200 OK`
```json
{ "ok": true }
```

---

### `POST /api/attempt-violation`
Records a tab switch or fullscreen exit event. Automatically submits on the 3rd violation.
- **Access**: Student
- **Request Body**:
```json
{
  "attemptId": "k19a_bc...",
  "reason": "tab_switch"
}
```
- **Response**: `200 OK`
```json
{
  "count": 2,
  "submit": false
}
```

---

### `POST /api/submit-attempt`
Finalizes an attempt, calculates grades and scores, and transitions state to submitted.
- **Access**: Student
- **Request Body**:
```json
{
  "attemptId": "k19a_bc...",
  "answers": { ... }
}
```
- **Response**: `200 OK`
```json
{ "ok": true }
```

---

## 5. Level 3 Code Execution Endpoints

### `POST /api/run-level3`
Runs public and hidden test cases for a coding problem.
- **Access**: Student
- **Request Body**:
```json
{
  "attemptId": "k19a_bc...",
  "questionId": "good-pairs",
  "language": "python",
  "mode": "function",
  "source": "def numIdenticalPairs(nums):\n    return 0"
}
```
- **Response**: `200 OK`
```json
{
  "tests": [
    { "label": "Example 1", "public": true, "passed": true, "marks": 5 },
    { "label": "Hidden test 1", "public": false, "passed": false, "marks": 0 }
  ],
  "score": 5,
  "maxScore": 25,
  "cached": false
}
```

---

### `POST /api/debug-level3`
Executes candidate code against custom stdin input without affecting scores.
- **Access**: Student
- **Request Body**:
```json
{
  "attemptId": "k19a_bc...",
  "questionId": "good-pairs",
  "language": "python",
  "mode": "function",
  "source": "...",
  "stdin": "[1,2,3,1,1,3]"
}
```
- **Response**: `200 OK`
```json
{
  "passed": true,
  "stdout": "4\n",
  "stderr": "",
  "status": "Accepted",
  "timeMs": 28
}
```

---

## 6. Public Leaderboard

### `GET /api/leaderboard`
Returns the top 50 scores for the specified level.
- **Access**: Public
- **Query Parameters**: `?level=1|2|3`
- **Response**: `200 OK`
```json
{
  "leaderboard": [
    {
      "name": "21691A0501",
      "studyYear": 1,
      "level": 1,
      "correct": 4,
      "score": 20,
      "seconds": 210,
      "submittedAt": 1730135010
    }
  ]
}
```

---

## 7. Administrator Endpoints

### `POST /api/admin/login`
- **Access**: Public
- **Request Body**: `{ "username": "admin", "password": "..." }`
- **Response**: `200 OK` `{ "ok": true }`

### `POST /api/admin/logout`
- **Access**: Admin
- **Response**: `200 OK` `{ "ok": true }`

### `GET /api/admin/me`
- **Access**: Public / Admin
- **Response**: `200 OK` `{ "authenticated": true }`

### `GET /api/admin/dashboard`
Returns live cohort counts, active student sessions, and attempt distributions.
- **Access**: Admin
- **Query Parameters**: `?level=1|2|3`

### `GET /api/admin/runner-status`
Returns status of local compiler toolpaths and configured Judge0 endpoints.
- **Access**: Admin

### Student Roster Management:
- `GET /api/admin/students` — List all registered students.
- `POST /api/admin/students` — Register a new student (`registrationNumber`, `studyYear`, optional `password`).
- `PATCH /api/admin/students/:registrationNumber` — Update registration number, year, or password.
- `DELETE /api/admin/students/:registrationNumber` — Delete student and cascade purge sessions and attempts.
- `GET /api/admin/students/template` — Download `.xlsx` template.
- `GET /api/admin/students/export` — Download registered roster `.xlsx`.
- `POST /api/admin/students/import` — Binary upload of `.xlsx` to bulk import up to 500 students.
