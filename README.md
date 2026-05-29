# Arin Billing Automation

Automated bill download and management system for the MSEDCL (Mahadiscom) WSS portal. The app logs into the portal, scrapes the consumer list, downloads electricity bills in parallel, extracts data from each PDF, and uploads everything to Google Drive — all from a single web interface.

---

## Quick Links

| Guide | Description |
|---|---|
| [docs/SETUP.md](docs/SETUP.md) | Local development setup |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | VPS / Docker production deployment |
| [docs/GOOGLE_DRIVE.md](docs/GOOGLE_DRIVE.md) | Connecting Google Drive |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture & key files |

---

## What the App Does

```
MSEDCL Portal
    └── Login (via Remote Browser in the UI)
            └── Scrape consumer list
                    └── Download bills (concurrent burst mode)
                            ├── Extract data from each PDF
                            ├── Save to MySQL database
                            └── Upload to Google Drive
```

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui |
| **Backend** | Python 3.11 + FastAPI |
| **Automation** | Selenium (Chrome) with CDP |
| **Database** | MySQL (remote) |
| **Storage** | Local filesystem (`/var/arin`) + Google Drive |
| **Container** | Docker + Docker Compose |

## Requirements

- Node.js 18+
- Python 3.11+
- Google Chrome or Chromium
- MySQL database (remote — credentials in `.env`)

## 30-Second Start (Local Dev)

```bash
# 1. Copy environment template
cp .env.example .env          # then fill in your secrets

# 2. Start everything
chmod +x start.sh
./start.sh
```

The app will be available at **http://localhost:5000**

---

> For full setup instructions see [docs/SETUP.md](docs/SETUP.md)
