# System Architecture

A technical overview of how Arin Billing Automation is structured and how the main pieces interact.

---

## High-Level Flow

```
User (Browser)
    │
    │  HTTPS
    ▼
Nginx (reverse proxy)
    │
    │  HTTP :5000
    ▼
FastAPI Backend (main.py)
    ├── JWT Auth middleware
    ├── REST API endpoints
    ├── Background task queue
    │
    ├── BillAutomation (automation.py)
    │       └── Chrome via Selenium/CDP
    │               └── MSEDCL WSS Portal
    │
    ├── PDF Processor (processing.py)
    │       └── pdfplumber → extracts bill data
    │               └── MySQL → saves records
    │
    └── Google Drive (gdrive_utils.py)
            └── google-api-python-client
```

---

## Directory Structure

```
billing_automation/
├── backend/                     # Python FastAPI backend
│   ├── main.py                  # API routes, background tasks, worker management
│   ├── automation.py            # BillAutomation class — Selenium orchestration
│   ├── login_automation.py      # Consumer registration, dynamic form helpers
│   ├── processing.py            # PDF data extraction + MySQL persistence
│   ├── gdrive_utils.py          # Google Drive upload helpers
│   ├── batch_drive_upload.py    # Batch upload runner for completed bill folders
│   ├── auth.py                  # JWT authentication helpers
│   ├── get_new_token.py         # One-time Google OAuth token generator
│   └── requirements.txt         # Python dependencies
│
├── src/                         # React + TypeScript frontend
│   ├── pages/
│   │   ├── Index.tsx            # Main dashboard
│   │   ├── Login.tsx            # Authentication page
│   │   └── ConsumerConnect.tsx  # Consumer data viewer
│   ├── components/
│   │   ├── RemoteBrowser.tsx    # Live browser view + consumer management
│   │   ├── ConsumerFilter.tsx   # Bill list with selection and download trigger
│   │   └── ...                  # shadcn/ui components
│   └── lib/
│       └── api.ts               # All API call wrappers
│
├── docs/                        # Documentation
│   ├── SETUP.md                 # Local development guide
│   ├── DEPLOYMENT.md            # VPS production guide
│   ├── GOOGLE_DRIVE.md          # Drive connection guide
│   └── ARCHITECTURE.md          # This file
│
├── .env.example                 # Environment variable template
├── .gitignore                   # Git ignore rules
├── README.md                    # Project overview
├── Dockerfile                   # Container definition
├── docker-compose.yml           # Multi-container setup
├── start.sh                     # Local dev startup script
└── deploy.sh                    # VPS automated deploy script
```

---

## Key Classes & Functions

### `BillAutomation` (`backend/automation.py`)

The main Selenium controller. One instance = one Chrome window.

| Method | Purpose |
|---|---|
| `launch_browser(date)` | Opens Chrome, navigates to MSEDCL portal |
| `fill_login_credentials(date, custom_id)` | Fills login form via CDP events |
| `get_cookies()` / `set_cookies(cookies)` | Session transfer between workers |
| `get_consumer_list()` | Scrapes the consumer grid and returns structured data |
| `download_bills(selective_indices)` | **Main download loop** — concurrent burst mode |

### `download_bills` — Burst Architecture

```
For each burst of DOWNLOAD_BURST_SIZE bills:
    Step A  → Click all "View Bill" buttons simultaneously
    Step B  → Wait (50ms polling) for all tabs to open
    Step C  → Collect each tab's bill URL
    Step D  → ThreadPoolExecutor: HTTP-fetch all PDFs in parallel
    Step E  → For tabs where HTTP fails → click in-browser download button
    Step F  → Rename & cache all successfully fetched PDFs
After all bursts:
    → Wait for any background browser downloads (crdownload)
    → Bulk-rename remaining PDFs
    → Clean up temp files
```

### Worker Model (`backend/main.py`)

When the user clicks **Download**, the backend:

1. Splits the selected bill indices across N workers (N = slider value)
2. Worker 0 = primary browser (already running)
3. Workers 1–N = new browser instances launched in background threads, each with its own Chrome port (9223, 9224, …)
4. Each worker receives shared session cookies so no re-login is needed
5. All workers run `download_bills()` simultaneously

---

## API Endpoints Reference

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/login` | JWT login |
| `GET` | `/api/status` | Browser and system status |
| `POST` | `/api/launch` | Launch Chrome browser |
| `POST` | `/api/fill-credentials` | Fill portal login form |
| `GET` | `/api/consumers` | Get consumer list from page |
| `POST` | `/api/download` | Start batch bill download |
| `GET` | `/api/progress` | Download progress (SSE) |
| `POST` | `/api/reset` | Force-reset browser sessions |
| `GET` | `/api/stats` | Dashboard statistics from DB |
| `POST` | `/api/add-consumer` | Add consumer to WSS account |
| `GET` | `/api/drive/status` | Google Drive connectivity check |

---

## Data Flow: Bill PDF → Database → Drive

```
1. Download PDF        →  /var/arin/YYYY-MM-DD/_tmp_<consumer_num>.pdf
2. Extract data        →  pdfplumber reads consumer number, name, bill month, amount
3. Rename PDF          →  /var/arin/YYYY-MM-DD/<consumer_num>_MMM_YYYY.pdf
4. Save to MySQL       →  tables: customers, bill_generation_details
5. Update JSON cache   →  /var/arin/YYYY-MM-DD/extracted_cache.json  (for UI progress)
6. Upload to Drive     →  <FOLDER_ID>/YYYY-MM-DD/<consumer_num>_MMM_YYYY.pdf
```

---

## Environment Architecture

```
Local Dev:
  BROWSER_HEADLESS=0   → Chrome window visible on your Mac screen
  ARIN_STORAGE_PATH=./downloads

VPS Production:
  BROWSER_HEADLESS=1   → Chrome runs headless (no display needed)
  ARIN_STORAGE_PATH=/var/arin
  (mounted as Docker volume)
```
