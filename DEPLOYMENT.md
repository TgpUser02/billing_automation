# Billing Automation – VPS Deployment Guide

This guide covers the end-to-end deployment of the Headless Billing Automation system to a Linux VPS (Ubuntu/Debian) with Nginx, automated SSL (Let's Encrypt), and Docker.

---

## 🚀 The Recommended Path: Automated Deployment

We provide a `deploy.sh` script in the root directory that automates:
1. Installing system dependencies (Docker, Docker Compose, Nginx, Certbot).
2. Creating local storage directories (`/var/arin`) with proper permissions.
3. Prompting for your domain name and email address.
4. Setting up Nginx virtual host proxy configurations.
5. Acquiring and configuring Let's Encrypt SSL certificates (HTTPS).
6. Generating default production environment variables (`.env`).
7. Spinning up Docker containers.

### Step-by-Step Instructions

#### 1. Configure DNS Records
Before running the deployment, log in to your domain registrar (e.g., GoDaddy, Namecheap, Cloudflare) and add an **A Record** pointing to your VPS public IP address:
* **Host/Name:** `billing` (or `@` if using root domain)
* **Value/IP:** `<YOUR_VPS_PUBLIC_IP>`

#### 2. Clone the Repository on the VPS
SSH into your VPS, clone the repository, and navigate to the project root:
```bash
git clone <your-repository-url>
cd billing_automation
```

#### 3. Run the Automated Deployment Script
Make the script executable and run it as root:
```bash
chmod +x deploy.sh
sudo ./deploy.sh
```

Follow the interactive prompts:
* **Custom domain name:** Enter your configured domain (e.g., `billing.yourdomain.com`).
* **Email address:** Enter your email address to receive Let's Encrypt certificate renewal alerts.

#### 4. Configure Production Credentials
Once the containers start up, you must configure the Google Drive API and Database variables in the production `.env` file:
```bash
nano .env
```
Ensure you update the following credentials:
```env
# Database Configuration (Remote MySQL Database)
DB_HOST=166.62.28.141
DB_PORT=3306
DB_USER=Arin
DB_PASSWORD=Arin@098123
DB_NAME=Arin_Energy

# Google Drive API Configuration
GOOGLE_DRIVE_FOLDER_ID=your_drive_folder_id
GOOGLE_DRIVE_CLIENT_ID=57647831301-slmprltdearnsftettb4isjg2pnn0u3g.apps.googleusercontent.com
GOOGLE_DRIVE_CLIENT_SECRET=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
GOOGLE_DRIVE_REFRESH_TOKEN=your_refresh_token
```

#### 5. Restart Containers with new Credentials
Apply the new credentials by recreating the containers:
```bash
docker compose up -d --build
```

---

## 🛠️ Manual Configuration (Alternative)

If you prefer to configure components manually, follow these details:

### 1. Install Packages
```bash
sudo apt update
sudo apt install -y curl git nginx certbot python3-certbot-nginx
```

### 2. Install Docker
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo apt-get install docker-compose-plugin -y
```

### 3. Create Storage Directories
```bash
sudo mkdir -p /var/arin
sudo chmod -R 777 /var/arin
```

### 4. Create Nginx Site Configuration
Create a virtual host file `/etc/nginx/sites-available/billing`:
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

Enable it and obtain the SSL certificate:
```bash
sudo ln -sf /etc/nginx/sites-available/billing /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Obtain SSL Certificate
sudo certbot --nginx -d billing.yourdomain.com
```

### 5. Build and Deploy Containers
```bash
docker compose up -d --build
```

---

## ⚙️ Maintenance & Logs

**Check Container Status:**
```bash
docker compose ps
```

**Check Realtime Logs:**
To monitor background scraping progress or inspect errors:
```bash
docker compose logs -f --tail=100
```

**Stop the Application:**
```bash
docker compose down
```

**Force Reset Stuck Browsers:**
If a browser session gets stuck, use the **"Force Reset System"** button in the top-right corner of the web interface. This calls `/api/reset` to terminate background headless processes.
