# Billing Automation – VPS Deployment Guide

This guide covers the end-to-end deployment of the Headless Billing Automation system to a Linux VPS (Ubuntu/Debian) using Docker. 

If your VPS is already running other services like **Frappe LMS** (which binds to ports 80 and 443), this guide details how to configure a custom Nginx reverse proxy to host the Billing Automation system on a separate subdomain (e.g., `billing.yourdomain.com`) without causing port conflicts.

---

## 1. Prerequisites
Ensure your VPS has the following installed:
- **Git** (to clone the repository)
- **Docker** & **Docker Compose**

If Docker is not installed on your VPS, you can install it using:
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo apt-get install docker-compose-plugin -y
```

---

## 2. Setup the Repository
Clone your project onto the VPS and navigate to the project directory:
```bash
git clone <your-repository-url>
cd billing_automation
```

---

## 3. Environment Variables Configuration (`.env`)
Create a `.env` file in the root directory:
```bash
cp .env.example .env
```
Edit the `.env` file (e.g., using `nano .env`) and configure the variables. Since this runs on a headless server, make sure `BROWSER_HEADLESS=1` is set:

```env
# Frontend Configuration
VITE_API_BASE_URL=/api

# Headless Browser Configuration
BROWSER_HEADLESS=1

# Backend Storage (mapped to Docker volume)
ARIN_STORAGE_PATH=/app/downloads

# Database Configuration (Remote MySQL Database)
DB_HOST=166.62.28.141
DB_PORT=3306
DB_USER=Arin
DB_PASSWORD=Arin@098123
DB_NAME=Arin_Energy

# JWT Authentication
JWT_SECRET_KEY=generate_a_random_hex_string_using_openssl_rand_-hex_32
JWT_ALGORITHM=HS256
JWT_EXPIRATION_MINUTES=1440

# Google reCAPTCHA v2 Keys
RECAPTCHA_SITE_KEY=6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI
RECAPTCHA_SECRET_KEY=6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe

# Google Drive API Configuration
GOOGLE_DRIVE_FOLDER_ID=your_drive_folder_id
GOOGLE_DRIVE_CLIENT_ID=57647831301-slmprltdearnsftettb4isjg2pnn0u3g.apps.googleusercontent.com
GOOGLE_DRIVE_CLIENT_SECRET=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
GOOGLE_DRIVE_REFRESH_TOKEN=your_refresh_token
```

---

## 4. Build and Deploy
The deployment is managed by an optimized, two-stage Docker setup. It compiles the React Frontend and bundles it with the Python FastAPI Backend.

Run the following command to start the deployment:
```bash
docker compose up -d --build
```

### What this command does:
1. **Frontend Build:** Installs Node.js dependencies and compiles the Vite React app into static files.
2. **Backend Build:** Installs Python 3.11, Google Chrome, Playwright (Chromium), and all backend dependencies.
3. **Serving:** FastAPI mounts the static React bundle and serves the entire application on port `5000` (which is mapped to port `5000` on your host).
4. **Volume Binding:** Creates a `./downloads` folder on your host machine linked directly to `/app/downloads` in the container.

---

## 5. Co-hosting with Frappe LMS (Nginx Setup)

Since Frappe LMS is running on your server, ports 80/443 are already managed by Nginx. We route traffic to the billing container using a new subdomain:

1. Create a new Nginx configuration file `/etc/nginx/sites-available/billing`:
```nginx
server {
    listen 80;
    server_name billing.yourdomain.com; # Replace with your dedicated subdomain

    location / {
        proxy_pass http://127.0.0.1:5000; # Forward requests to Docker
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

2. Link it to `sites-enabled` and reload Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/billing /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

3. Obtain SSL/HTTPS using Certbot:
```bash
sudo certbot --nginx -d billing.yourdomain.com
```

Your Frappe LMS will continue running on its domain, and your Billing Automation app will be fully isolated and accessible securely at `https://billing.yourdomain.com`.

---

## 6. System Management & Maintenance

**Check Logs:**
To monitor background scraping progress or debug errors:
```bash
docker compose logs -f
```

**Restarting the Container:**
```bash
docker compose up -d --build
```

**Stopping the App:**
```bash
docker compose down
```

**System Reset:**
If a browser session gets stuck, use the **"Force Reset System"** button in the top-right corner of the web interface. This triggers the `/api/reset` endpoint to cleanly terminate background headless browsers and reset your session.
