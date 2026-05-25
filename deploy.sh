#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Automated VPS Deployment Script for Billing Automation
# Installs: Docker, Nginx, Certbot → Configures SSL Domain → Runs Application
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
step() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }

# Ensure script is run as root
if [ "$EUID" -ne 0 ]; then
    err "This script must be run as root. Please use: sudo ./deploy.sh"
fi

# ── 1. Dependency Checks & Installations ──────────────────────────────────
step "1/6: Checking and installing system dependencies"

# Update apt-get
apt-get update -qq

# Install basic utils if not present
apt-get install -y curl git gnupg ca-certificates apt-transport-https lsb-release -qq >/dev/null

# Docker Check / Install
if ! command -v docker &> /dev/null; then
    warn "Docker is not installed. Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh >/dev/null
    rm get-docker.sh
    log "Docker installed successfully"
else
    log "Docker is already installed"
fi

# Docker Compose Check
if ! docker compose version &> /dev/null; then
    warn "Docker Compose plugin is not installed. Installing..."
    apt-get install -y docker-compose-plugin -qq >/dev/null
    log "Docker Compose plugin installed"
else
    log "Docker Compose plugin is already installed"
fi

# Nginx Check / Install
if ! command -v nginx &> /dev/null; then
    warn "Nginx is not installed. Installing Nginx..."
    apt-get install -y nginx -qq >/dev/null
    log "Nginx installed successfully"
else
    log "Nginx is already installed"
fi

# Certbot Check / Install
if ! command -v certbot &> /dev/null; then
    warn "Certbot is not installed. Installing Certbot..."
    apt-get install -y certbot python3-certbot-nginx -qq >/dev/null
    log "Certbot installed successfully"
else
    log "Certbot is already installed"
fi

# ── 2. Input Domain Configuration ─────────────────────────────────────────
step "2/6: Domain and Email configurations"

# Ask user for domain name
read -p "Enter your custom domain name (e.g., billing.yourdomain.com): " DOMAIN
if [ -z "$DOMAIN" ]; then
    err "Domain name cannot be empty."
fi

# Ask user for email address for Let's Encrypt
read -p "Enter email address for SSL renewal notifications: " EMAIL
if [ -z "$EMAIL" ]; then
    err "Email address cannot be empty."
fi

# Verify domain DNS resolution (simple check)
warn "Validating DNS resolution for $DOMAIN..."
if ! host "$DOMAIN" &> /dev/null; then
    warn "Could not resolve DNS for $DOMAIN. Make sure your domain's A record points to this VPS IP before running Certbot."
    read -p "Do you want to proceed anyway? (y/n): " PROCEED
    if [[ ! "$PROCEED" =~ ^[Yy]$ ]]; then
        err "Deployment cancelled to configure DNS."
    fi
fi

# ── 3. Write Nginx Configuration ──────────────────────────────────────────
step "3/6: Generating Nginx configuration file"

NGINX_CONF="/etc/nginx/sites-available/billing"

cat << EOF > "$NGINX_CONF"
server {
    listen 80;
    server_name $DOMAIN;

    client_max_body_size 50M;

    # Proxy to the FastAPI + React Docker container
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# Symlink to sites-enabled
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/

# Test Nginx syntax
if nginx -t &> /dev/null; then
    log "Nginx configuration syntax is valid"
    systemctl restart nginx
    log "Nginx restarted successfully"
else
    nginx -t
    err "Nginx configuration test failed"
fi

# ── 4. SSL Retrieval (Let's Encrypt Certbot) ──────────────────────────────
step "4/6: Obtaining SSL Certificate via Let's Encrypt"

# Run Certbot to acquire SSL and modify Nginx config automatically
if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "$EMAIL" --redirect; then
    log "SSL Certificate successfully configured for $DOMAIN!"
    systemctl reload nginx
else
    warn "Certbot failed to acquire SSL certificate. Nginx will remain running on HTTP (Port 80)."
    warn "You can retry SSL setup later by running: sudo certbot --nginx -d $DOMAIN"
fi

# ── 5. Setup Storage and Permissions ──────────────────────────────────────
step "5/6: Setting up local directories and permissions"

STORAGE_PATH="/var/arin"
if [ ! -d "$STORAGE_PATH" ]; then
    mkdir -p "$STORAGE_PATH"
    log "Created storage path: $STORAGE_PATH"
fi
chmod -R 777 "$STORAGE_PATH"
log "Set read/write permissions for storage path: $STORAGE_PATH"

# ── 6. Environment & Docker Compose Initialization ────────────────────────
step "6/6: Starting Docker containers"

# Check if .env file exists in the current directory
if [ ! -f ".env" ]; then
    warn ".env file not found. Copying from .env.example..."
    cp .env.example .env
    
    # Update default configurations for production VPS
    sed -i "s|VITE_API_BASE_URL=.*|VITE_API_BASE_URL=/api|g" .env
    sed -i "s|ARIN_STORAGE_PATH=.*|ARIN_STORAGE_PATH=/app/downloads|g" .env
    sed -i "s|BROWSER_HEADLESS=.*|BROWSER_HEADLESS=1|g" .env
    
    # Generate new random JWT secret
    JWT_SECRET=$(openssl rand -hex 32)
    sed -i "s|JWT_SECRET_KEY=.*|JWT_SECRET_KEY=$JWT_SECRET|g" .env

    log ".env file initialized with production defaults."
    warn "IMPORTANT: Please review/edit your database and Google Drive configurations in the .env file."
fi

# Build and run containers
docker compose down --remove-orphans || true
docker compose up -d --build

log "Docker containers successfully built and running!"

# ── Done ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  🚀 Deployment Completed Successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Your app is hosted at: ${CYAN}https://$DOMAIN${NC}"
echo -e "  Backend local port:    ${CYAN}http://localhost:5000${NC}"
echo -e "  Storage directory:     ${CYAN}$STORAGE_PATH${NC}"
echo ""
echo -e "  To view logs, run:     ${YELLOW}docker compose logs -f${NC}"
echo -e "  To stop services, run: ${YELLOW}docker compose down${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
