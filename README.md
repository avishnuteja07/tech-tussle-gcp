# GMOCS — MITS Student Login and Coding Challenge Platform

A clean, modular online examination and coding challenge platform built with **Node.js**, **Express**, and **PostgreSQL**.

The application powers multi-level timed assessments:
- **Level 1 (Bug Smash)**: 15-minute diagnostic debugging quiz.
- **Level 2 (Code Rescue)**: 25-minute interactive frontend and DOM challenge with live preview.
- **Level 3 (Algorithm Challenge)**: 30-minute programming competition in 6 languages (Python, JavaScript, C, C++, C#, Java) with local native compilation and Judge0 fallbacks.

---

## 1. Prerequisites

- **Node.js**: `v22.13.0` or newer (LTS recommended)
- **PostgreSQL**: `v14` or newer (v16 recommended)
- **Compilers (Optional for Level 3 Local Execution)**:
  - GCC / G++ (C, C++)
  - Python 3
  - OpenJDK 17 (Java)
  - Mono / .NET CSC (C#)
  *(If local compilers are not installed, the platform seamlessly routes Level 3 submissions to remote Judge0 APIs).*

---

## 2. Quickstart for Local Development

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Edit `.env` and set your PostgreSQL connection URL:
```env
NODE_ENV=development
HOST=127.0.0.1
PORT=3000
COOKIE_SECURE=false

DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/mits_login

# Optional: set an admin bootstrap password
ADMIN_USERNAME=admin
ADMIN_PASSWORD=Admin@12345

# Level Unlock PINs
LEVEL_2_PIN=2222
LEVEL_3_PIN=3333
```

### Step 3: Initialize the PostgreSQL Database
Create the empty `mits_login` database in PostgreSQL:
```sql
CREATE DATABASE mits_login;
```

Apply the database schema:
```bash
npm run migrate
```

Check schema status:
```bash
node src/database/migrate.js --status
```

### Step 4: Create the First Administrator
You can create an administrator using the interactive CLI command:
```bash
node manage.js add-admin myadmin
```
*(Enter a password with at least 8 characters when prompted).*

Alternatively, configure `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.env` to automatically provision the account at startup.

### Step 5: Start the Application
```bash
npm start
```
Open **`http://127.0.0.1:3000`** in your browser.

*(Optional for local testing)*: To seed 3 sample student accounts for development:
```bash
npm run seed:dev
```

---

## 3. Running Automated Tests

Run the complete test suite (unit and integration tests):
```bash
npm test
```

---

## 4. Administrative CLI Tools (`manage.js`)

Manage administrators, student accounts, and attempt grading from the command line:

```bash
# Add an administrator interactively
node manage.js add-admin myadmin

# Add a student account with default password (tech@123)
node manage.js add-user 21691A0501 --year I

# Update a student's year of study
node manage.js set-year 21691A0501 II

# List all registered students
npm run users

# List student exam attempts (optional: filter by year)
node manage.js list-attempts --year 1

# Manually grade/re-mark questions in an attempt
node manage.js mark-attempt ATTEMPT_ID --correct c-1,dsa-2
```

---

## 5. Production Deployment on Google Cloud Compute Engine VM

Deploy on a **Google Cloud VM running Ubuntu 24.04 LTS** with PostgreSQL and Node.js on the same machine.

### Step 1: Provision the VM
1. In the **GCP Console**, navigate to **Compute Engine** $\rightarrow$ **VM instances** $\rightarrow$ **Create Instance**.
2. **Name**: `mits-exam-server`
3. **Region**: Choose closest to your students (e.g. `asia-south1`).
4. **Machine Type**: `e2-standard-2` (2 vCPUs, 8 GB RAM recommended for local code compilation).
5. **Boot Disk**: **Ubuntu 24.04 LTS**, 30 GB SSD.
6. **Firewall**: Check **Allow HTTP traffic** and **Allow HTTPS traffic**.
7. Click **Create** and connect via SSH.

### Step 2: Install Node.js 22, PostgreSQL, and Compilers
```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs postgresql postgresql-contrib gcc g++ python3 openjdk-17-jdk-headless mono-mcs mono-runtime git nginx
```

### Step 3: Configure Dedicated PostgreSQL Application User
```bash
sudo -u postgres psql
```
Inside the `psql` console:
```sql
CREATE DATABASE mits_login;
CREATE USER mits_admin WITH ENCRYPTED PASSWORD 'YourExtremelyStrongPasswordHere!';
GRANT ALL PRIVILEGES ON DATABASE mits_login TO mits_admin;
ALTER DATABASE mits_login OWNER TO mits_admin;
\c mits_login
GRANT ALL ON SCHEMA public TO mits_admin;
\q
```

### Step 4: Deploy the Application Code
```bash
# Create dedicated system user
sudo useradd -r -s /bin/false mitsapp

# Clone application repository
sudo mkdir -p /opt/mits-login
sudo git clone https://github.com/avishnuteja07/gmocs /opt/mits-login
cd /opt/mits-login

# Install production dependencies
sudo npm ci --omit=dev

# Configure production environment
sudo cp .env.example .env
sudo nano .env
```

Configure `.env`:
```env
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
COOKIE_SECURE=true

DATABASE_URL=postgresql://mits_admin:YourExtremelyStrongPasswordHere!@127.0.0.1:5432/mits_login

ADMIN_USERNAME=exam_admin
ADMIN_PASSWORD=AdminSecurePass2026!

LEVEL_2_PIN=8192
LEVEL_3_PIN=4096
RUNNER_PREFERENCE=local,remote
```

Protect `.env`:
```bash
sudo chown -R mitsapp:mitsapp /opt/mits-login
sudo chmod 600 /opt/mits-login/.env
```

### Step 5: Run Schema Initialization
```bash
sudo -u mitsapp node src/database/migrate.js
```

### Step 6: Configure systemd Service
Copy the included service file:
```bash
sudo cp scripts/mits-platform.service /etc/systemd/system/mits-platform.service
sudo systemctl daemon-reload
sudo systemctl enable mits-platform
sudo systemctl start mits-platform
```

Check status:
```bash
sudo systemctl status mits-platform
```

### Step 7: Configure Nginx as Reverse Proxy
Create `/etc/nginx/sites-available/mits-login`:
```nginx
server {
    listen 80;
    server_name your-exam-domain.edu; # or your VM's public external IP

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and reload Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/mits-login /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

*(For SSL, install Certbot: `sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx`).*

---

## 6. Architecture & Documentation Directory

- **[Database Setup Guide](docs/DATABASE_SETUP.md)**: Clean installation, user provisioning, schema initialization, and administrator creation.
- **[System Architecture Guide](docs/ARCHITECTURE.md)**: Layer diagrams, request lifecycles, and transaction boundaries.
- **[Database Schema Documentation](docs/DATABASE_SCHEMA.md)**: Clean relational schema specification and index definitions.
- **[API Reference Documentation](docs/API_DOCUMENTATION.md)**: Complete API endpoint catalog, payload formats, and status codes.
