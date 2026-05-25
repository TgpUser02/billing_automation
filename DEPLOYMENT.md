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

## 5. Option A: Direct Access via IP and Port (No Nginx Configuration)

The simplest way to access the application on your VPS without domain names or proxy configurations is directly via the exposed Docker port `5000`:

1. Allow port `5000` on your VPS firewall:
   ```bash
   sudo ufw allow 5000/tcp
   ```

2. Open your web browser and navigate to:
   ```
   http://<YOUR_VPS_IP_ADDRESS>:5000
   ```
   *Thanks to our dynamic URL routing, the React frontend will automatically connect to `http://<YOUR_VPS_IP_ADDRESS>:5000/api` with no extra reverse proxy configuration needed.*

---

## 6. Option B: Routing via Nginx using VPS IP on a Custom Port

If you want Nginx to act as a reverse proxy for your IP address on a custom port (e.g. `8080` or `8081` to avoid conflicting with Frappe LMS on port 80/443):

### 1. Install Nginx
If Nginx is not installed yet on your VPS, run:
```bash
sudo apt update
sudo apt install nginx -y
```

### 2. Create the Site Configuration
Create a virtual host file `/etc/nginx/sites-available/billing`:
```nginx
server {
    listen 8080; # Listen on port 8080 for IP-based access
    server_name _; # Matches any request coming to this port (including your VPS IP)

    location / {
        proxy_pass http://127.0.0.1:5000; # Forward to the Docker container
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

### 3. Enable the Config and Restart Nginx
Link the configuration and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/billing /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 4. Firewall Setup
Allow port `8080` (or the port you configured) on your VPS firewall:
```bash
sudo ufw allow 8080/tcp
```

You can now access the application securely through Nginx by visiting:
```
http://<YOUR_VPS_IP_ADDRESS>:8080
```

---

## 7. System Management & Maintenance

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
