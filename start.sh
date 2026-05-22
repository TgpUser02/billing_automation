#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ARIN Billing Automation — One-Shot Launcher
# Starts: Docker → Selenium-noVNC → Backend → Frontend
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }
step() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }

cleanup() {
    echo ""
    warn "Shutting down..."
    # Kill background jobs (backend + frontend)
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    # Stop selenium container
    pkill -f "uvicorn main:app" 2>/dev/null || true
    pkill -f "npm run dev" 2>/dev/null || true
    log "All services stopped."
    exit 0
}
trap cleanup SIGINT SIGTERM

# ── 1. Python Virtual Environment ───────────────────────────────────────────
step "1/3  Setting up Python backend"

if [ ! -d "$DIR/.venv" ]; then
    warn "Creating Python virtual environment..."
    python3 -m venv "$DIR/.venv"
fi
source "$DIR/.venv/bin/activate"

# Install deps if needed
if ! python -c "import fastapi" 2>/dev/null; then
    warn "Installing Python dependencies..."
    pip install -r "$DIR/backend/requirements.txt" -q
fi
log "Python environment ready"

# ── 2. Start Backend ────────────────────────────────────────────────────────
step "2/3  Starting FastAPI Backend (port 5000)"

cd "$DIR/backend"
uvicorn main:app --reload --host 0.0.0.0 --port 5000 &
BACKEND_PID=$!
cd "$DIR"

# Wait for backend
sleep 2
if kill -0 $BACKEND_PID 2>/dev/null; then
    log "Backend running (PID: $BACKEND_PID)"
else
    err "Backend failed to start. Check logs above."
    exit 1
fi

# ── 3. Start Frontend ───────────────────────────────────────────────────────
step "3/3  Starting Vite Frontend (port 5173)"

cd "$DIR"
npm run dev &
FRONTEND_PID=$!

sleep 3
if kill -0 $FRONTEND_PID 2>/dev/null; then
    log "Frontend running (PID: $FRONTEND_PID)"
else
    err "Frontend failed to start. Check logs above."
    exit 1
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  🚀 ARIN Billing Automation — All Systems Go!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${CYAN}Frontend:${NC}    http://localhost:5173"
echo -e "  ${CYAN}Backend:${NC}     http://localhost:5000"
echo ""
echo -e "  Press ${YELLOW}Ctrl+C${NC} to stop all services"
echo ""

# Keep alive — wait for any background job to exit
wait
