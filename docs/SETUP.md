# Local Development Setup

Everything you need to run Arin Billing Automation on your Mac for development.

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 18+ | https://nodejs.org or `brew install node` |
| Python | 3.11+ | https://python.org or `brew install python` |
| Google Chrome | Latest | https://google.com/chrome |
| MySQL client | Any | Only needed if you want to connect to DB locally |

---

## 1. Clone & Configure

```bash
git clone <your-repo-url>
cd billing_automation

# Copy the environment template
cp .env.example .env
```

Open `.env` and fill in at minimum:

```env
# Database (required for bill data storage)
DB_HOST=166.62.28.141
DB_PORT=3306
DB_USER=Arin
DB_PASSWORD=your_password
DB_NAME=Arin_Energy

# Google Drive (optional for local dev — bills still save locally without it)
GOOGLE_DRIVE_CLIENT_ID=...
GOOGLE_DRIVE_CLIENT_SECRET=...
GOOGLE_DRIVE_REFRESH_TOKEN=...
GOOGLE_DRIVE_FOLDER_ID=...

# Storage path for downloaded bills
ARIN_STORAGE_PATH=./downloads

# Keep browser visible locally (set to 1 to run headless instead)
BROWSER_HEADLESS=0
```

---

## 2. Start the App

```bash
chmod +x start.sh
./start.sh
```

This script:
1. Creates a Python virtual environment and installs backend dependencies
2. Installs frontend npm packages
3. Builds the frontend
4. Starts the FastAPI backend on **http://localhost:5000**

The web UI is served by FastAPI from the `dist/` folder.

---

## 3. Development Mode (Hot Reload)

For frontend development with Vite's hot module replacement, run two terminals:

**Terminal 1 — Backend:**
```bash
cd backend
source ../.venv/bin/activate   # or .venv\Scripts\activate on Windows
uvicorn main:app --reload --port 5000
```

**Terminal 2 — Frontend:**
```bash
npm run dev
```

Frontend dev server runs on **http://localhost:5173** and proxies API calls to port 5000.

---

## 4. Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `DB_HOST` | ✅ | — | MySQL host |
| `DB_PORT` | ✅ | 3306 | MySQL port |
| `DB_USER` | ✅ | — | MySQL user |
| `DB_PASSWORD` | ✅ | — | MySQL password |
| `DB_NAME` | ✅ | — | MySQL database name |
| `JWT_SECRET_KEY` | ✅ | — | Secret for JWT auth tokens |
| `ARIN_STORAGE_PATH` | ✅ | `/var/arin` | Local directory for downloaded PDFs |
| `BROWSER_HEADLESS` | ❌ | `0` (local) / `1` (VPS) | Run Chrome headless |
| `GOOGLE_DRIVE_CLIENT_ID` | ❌ | — | OAuth client ID |
| `GOOGLE_DRIVE_CLIENT_SECRET` | ❌ | — | OAuth client secret |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | ❌ | — | Long-lived refresh token |
| `GOOGLE_DRIVE_FOLDER_ID` | ❌ | — | Target Drive folder ID |
| `DOWNLOAD_BURST_SIZE` | ❌ | `5` | Tabs opened simultaneously per worker (1–15) |

---

## 5. Key Commands

```bash
# Install/update frontend dependencies
npm install

# Build production frontend bundle
npm run build

# Run frontend linting
npm run lint

# Run Python syntax check
python3 -m py_compile backend/automation.py backend/main.py
```

---

## 6. Default Login

The app uses JWT authentication. Default credentials are set in the database `users` table. You can create a new user via the `/api/register` endpoint or directly in MySQL.

---

## Troubleshooting

**Chrome not found:**
Set the `CHROME_PATH` environment variable to your Chrome binary path.

**DB connection refused:**
Ensure your DB credentials in `.env` are correct and that the remote MySQL server allows connections from your IP.

**Port 5000 already in use:**
```bash
lsof -i :5000 | grep LISTEN
kill -9 <PID>
```
