# VPS / Production Deployment

Deploy Arin Billing Automation to a Linux VPS using Docker and Nginx with HTTPS.

---

## Requirements

- Ubuntu 22.04+ VPS with root access
- Domain name with an A record pointing to your VPS IP
- At least 4 GB RAM (8 GB recommended for multiple workers)

---

## Automated Deployment (Recommended)

We provide a `deploy.sh` script that handles everything automatically.

### Step 1 — Point your DNS

In your domain registrar's DNS panel, add an **A record**:

```
Type:  A
Name:  billing   (or @ for root domain)
Value: <YOUR_VPS_PUBLIC_IP>
TTL:   Auto
```

Wait 5–10 minutes for DNS to propagate.

### Step 2 — Clone the repo on the VPS

```bash
ssh root@<YOUR_VPS_IP>
git clone <your-repo-url>
cd billing_automation
```

### Step 3 — Run the deploy script

```bash
chmod +x deploy.sh
sudo ./deploy.sh
```

The script will ask you for:
- Your domain name (e.g. `billing.yourdomain.com`)
- Your email (for Let's Encrypt SSL renewal alerts)

It automatically installs Docker, Nginx, Certbot, creates `/var/arin` storage, sets up Nginx + HTTPS, and starts the containers.

### Step 4 — Set your secrets

```bash
nano .env
```

The must-have variables for production:

```env
# Database
DB_HOST=166.62.28.141
DB_PORT=3306
DB_USER=Arin
DB_PASSWORD=your_db_password
DB_NAME=Arin_Energy

# JWT
JWT_SECRET_KEY=change-this-to-a-long-random-string

# Google Drive
GOOGLE_DRIVE_CLIENT_ID=your_client_id
GOOGLE_DRIVE_CLIENT_SECRET=your_client_secret
GOOGLE_DRIVE_REFRESH_TOKEN=your_refresh_token
GOOGLE_DRIVE_FOLDER_ID=your_folder_id

# Storage
ARIN_STORAGE_PATH=/var/arin

# Run Chrome headless on VPS
BROWSER_HEADLESS=1

# Burst size for parallel bill downloads
DOWNLOAD_BURST_SIZE=5
```

### Step 5 — Restart containers

```bash
docker compose down
docker compose up -d --build
```

Your app is now live at `https://billing.yourdomain.com`.

---

## Manual Setup (Alternative)

### Install system packages

```bash
sudo apt update && sudo apt install -y curl git nginx certbot python3-certbot-nginx

# Install Docker
curl -fsSL https://get.docker.com | sudo sh
sudo apt-get install -y docker-compose-plugin
```

### Create storage directory

```bash
sudo mkdir -p /var/arin
sudo chmod -R 777 /var/arin
```

### Nginx configuration

Create `/etc/nginx/sites-available/billing`:

```nginx
server {
    listen 80;
    server_name billing.yourdomain.com;
    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:5000;
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

Enable the site and get SSL:

```bash
sudo ln -sf /etc/nginx/sites-available/billing /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx
sudo certbot --nginx -d billing.yourdomain.com
```

### Start the app

```bash
docker compose up -d --build
```

---

## Maintenance

### Common commands

```bash
# View live logs
docker compose logs -f --tail=100

# Check container status
docker compose ps

# Restart the app
docker compose restart

# Stop the app
docker compose down

# Update the app (after git pull)
git pull
docker compose up -d --build
```

### Storage management

Downloaded bills are stored in `/var/arin/<YYYY-MM-DD>/`. You can safely delete old date folders to free disk space.

```bash
# Check disk usage
du -sh /var/arin/*

# Delete bills older than 30 days
find /var/arin -maxdepth 1 -type d -mtime +30 -exec rm -rf {} +
```

### Browser session stuck?

If the browser session becomes unresponsive, use the **Force Reset System** button in the top-right of the web UI, or call the API directly:

```bash
curl -X POST http://localhost:5000/api/reset \
  -H "Authorization: Bearer <your_jwt_token>"
```

---

## Performance Tuning

The parallel download burst size is controlled by `DOWNLOAD_BURST_SIZE` in `.env`:

| Setting | Behaviour |
|---|---|
| `DOWNLOAD_BURST_SIZE=3` | Conservative — good for slow/unstable VPS connections |
| `DOWNLOAD_BURST_SIZE=5` | **Default** — balanced speed and reliability |
| `DOWNLOAD_BURST_SIZE=8` | Aggressive — use on fast VPS with good connectivity |

For multi-worker downloads, increase the worker count from the **Workers** slider in the UI. Each worker spawns a separate Chrome instance. Start with 2–3 workers and scale up based on VPS RAM:

| VPS RAM | Max Recommended Workers |
|---|---|
| 4 GB | 2 |
| 8 GB | 4 |
| 16 GB | 8 |
