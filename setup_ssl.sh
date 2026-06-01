#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SSL Certificate Setup for billing.arinenergy.com
# Run this on your VPS as root:  sudo bash setup_ssl.sh
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
set -e

DOMAIN="billing.arinenergy.com"
EMAIL=""       # ← FILL IN your email before running
APP_PORT=5000  # The port your Docker app listens on

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
step() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }

# ── Root check ────────────────────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
    err "Run as root: sudo bash setup_ssl.sh"
fi

# ── Email prompt if not set above ─────────────────────────────────────────────
if [ -z "$EMAIL" ]; then
    read -p "Enter your email for SSL renewal notifications: " EMAIL
    [ -z "$EMAIL" ] && err "Email is required."
fi

# ── Step 1: Install dependencies ──────────────────────────────────────────────
step "1/5: Installing Nginx & Certbot"
apt-get update -qq
apt-get install -y nginx certbot python3-certbot-nginx -qq > /dev/null
log "Nginx & Certbot ready"

# ── Step 2: Write Nginx HTTP config (needed for Certbot ACME challenge) ───────
step "2/5: Writing Nginx config for $DOMAIN"

NGINX_CONF="/etc/nginx/sites-available/billing-arinenergy"

cat > "$NGINX_CONF" <<NGINXEOF
# ── HTTP → redirect to HTTPS (Certbot will add/update this) ──────────────────
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    # Allow large file uploads (Excel, PDFs)
    client_max_body_size 50M;

    # Proxy all traffic to the FastAPI+React Docker container
    location / {
        proxy_pass         http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           \$http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 60s;
    }
}
NGINXEOF

log "Nginx config written to $NGINX_CONF"

# Enable the site
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/billing-arinenergy

# Disable default site to avoid conflicts
rm -f /etc/nginx/sites-enabled/default

# Test and reload Nginx
if nginx -t 2>/dev/null; then
    systemctl restart nginx
    log "Nginx restarted successfully"
else
    nginx -t
    err "Nginx config test failed — see errors above"
fi

# ── Step 3: Obtain SSL Certificate via Let's Encrypt ──────────────────────────
step "3/5: Obtaining SSL certificate from Let's Encrypt"

warn "Certbot will attempt DNS validation for ${DOMAIN}."
warn "Make sure the domain's A record points to THIS server's IP before continuing."
echo ""
read -p "Press ENTER to continue with Certbot, or Ctrl+C to abort..."

if certbot --nginx \
    -d "$DOMAIN" \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    --redirect \
    --keep-until-expiring; then

    log "SSL Certificate issued and Nginx updated for HTTPS!"
    systemctl reload nginx
    log "Nginx reloaded with HTTPS config"
else
    warn "Certbot failed. Possible reasons:"
    warn "  • DNS A record for ${DOMAIN} doesn't point to this server's IP"
    warn "  • Port 80 is blocked by a firewall"
    warn "  • Rate limit hit (5 certs/domain/week from Let's Encrypt)"
    echo ""
    warn "To retry manually after fixing DNS:  sudo certbot --nginx -d ${DOMAIN}"
    exit 1
fi

# ── Step 4: Enable Certbot Auto-Renewal ───────────────────────────────────────
step "4/5: Enabling automatic certificate renewal"

# Certbot installs a systemd timer automatically on Ubuntu 20+
# Verify it's active, or fall back to cron
if systemctl list-timers | grep -q certbot; then
    log "Certbot systemd renewal timer is already active"
else
    # Add cron fallback (runs twice daily as recommended by Let's Encrypt)
    CRON_JOB="0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'"
    (crontab -l 2>/dev/null | grep -qF "certbot renew") || \
        (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
    log "Certbot renewal cron job added (runs daily at 3AM)"
fi

# Test the renewal config (dry-run)
warn "Running dry-run renewal test..."
if certbot renew --dry-run --quiet; then
    log "Auto-renewal dry-run passed ✓"
else
    warn "Dry-run failed — check your Certbot config but live cert is still valid"
fi

# ── Step 5: Verify HTTPS is working ───────────────────────────────────────────
step "5/5: Verifying HTTPS is live"

sleep 2
if curl -sSf --max-time 10 "https://${DOMAIN}/login" -o /dev/null; then
    log "https://${DOMAIN}/login is responding correctly ✓"
else
    warn "Could not reach https://${DOMAIN}/login — your app container may not be running yet."
    warn "Start the app with:  docker compose up -d"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  🔒 SSL Setup Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Live URL:        ${CYAN}https://${DOMAIN}/login${NC}"
echo -e "  Nginx config:    ${CYAN}${NGINX_CONF}${NC}"
echo -e "  Cert location:   ${CYAN}/etc/letsencrypt/live/${DOMAIN}/${NC}"
echo -e "  Cert expires:    ${CYAN}$(certbot certificates 2>/dev/null | grep 'Expiry Date' | head -1 | awk '{print $3, $4}')${NC}"
echo ""
echo -e "  Useful commands:"
echo -e "    Check cert:    ${YELLOW}sudo certbot certificates${NC}"
echo -e "    Force renew:   ${YELLOW}sudo certbot renew --force-renewal${NC}"
echo -e "    View Nginx:    ${YELLOW}sudo nginx -T | grep -A30 billing${NC}"
echo -e "    App logs:      ${YELLOW}docker compose logs -f${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
