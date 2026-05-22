# Billing Automation – VPS Deployment Guide

This guide covers the end-to-end deployment of the Headless Billing Automation system to a Linux VPS (Ubuntu/Debian) using Docker. The architecture has been completely streamlined into a single Docker container that houses the React UI, FastAPI Backend, Playwright, and Selenium dependencies.

## 1. Prerequisites
Ensure your VPS has the following installed:
- **Git** (to clone the repository)
- **Docker** & **Docker Compose**

If Docker is not installed on your VPS, you can install it quickly using:
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo apt-get install docker-compose-plugin -y
```

## 2. Setup the Repository
Clone your project onto the VPS and navigate to the project directory:
```bash
git clone <your-repository-url>
cd billing_automation
```

## 3. Environment Variables Configuration (`.env`)
The system requires specific environment variables for authentication, database connections, and Google Drive integrations. 

Create a `.env` file in the root directory:
```bash
touch .env
```
Edit the `.env` file (e.g., using `nano .env`) and configure the following required parameters:

```env
# ── Application Auth ─────────────────────
APP_USERNAME=admin                 # Username to log into the web panel
APP_PASSWORD=secure_password123    # Password to log into the web panel
JWT_SECRET_KEY=your_random_secret  # Run `openssl rand -hex 32` to generate a secure key
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# ── Headless Browser Config ──────────────
# (Optional) Tweak these if you experience timeouts on slow VPS connections
PAGE_LOAD_TIMEOUT=60000
SELENIUM_HEADLESS=True

# ── Google Drive API Credentials ─────────
# Path to your Google Service Account JSON file for Zero-Gen CSV uploading
GOOGLE_APPLICATION_CREDENTIALS=/app/backend/credentials.json
GOOGLE_DRIVE_FOLDER_ID=your_gdrive_folder_id_here
```
> **Note:** If you are using Google Drive uploads, ensure you actually place your `credentials.json` file inside the `backend/` directory before building the container, as specified by the path above.

## 4. Build and Deploy
The deployment is managed by a highly optimized, two-stage Docker setup. It will automatically compile the React Frontend and bundle it with the Python Backend.

Run the following command to start the deployment:
```bash
docker compose up -d --build
```

### What this command does:
1. **Frontend Build:** Installs Node.js dependencies and compiles the Vite React app into static files.
2. **Backend Build:** Installs Python 3.11, Google Chrome, Playwright (Chromium), and all backend pip dependencies.
3. **Serving:** FastAPI mounts the static React bundle and serves the entire application seamlessly on port 5000 (which is mapped to port **80** on your host).
4. **Volume Binding:** Creates a `./downloads` folder on your host machine linked directly to `/app/downloads` in the container. Any PDFs downloaded by the scraping engine will safely appear on your VPS filesystem.

## 5. Accessing the Application
Once the build is complete (it may take a few minutes the first time to install Chrome/Chromium dependencies), the application will be live!

Open your web browser and navigate to:
```
http://<YOUR_VPS_IP_ADDRESS>
```

You will be greeted by the login screen. Use the `APP_USERNAME` and `APP_PASSWORD` defined in your `.env` file to log in.

## 6. System Management & Maintenance

**Check Live Logs:**
To monitor the background scraping progress or debug errors:
```bash
docker compose logs -f
```

**Restarting the Container:**
If you make changes to the code, simply rebuild and restart:
```bash
docker compose up -d --build
```

**Stopping the App:**
```bash
docker compose down
```

**System Reset:**
If a process gets stuck or errors out, you do not need to restart Docker. Simply use the **"Force Reset System"** button located in the top-right corner of the web interface. This hits the `/api/reset` endpoint to safely terminate background headless browsers and reset your interface cleanly.
