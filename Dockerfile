# ── Stage 1: Build React Frontend ───────────────────────────────────────────
FROM node:20-bullseye-slim AS frontend-builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# ── Stage 2: Build Python Backend & Browser Dependencies ────────────────────
FROM python:3.11-slim

# Install system dependencies
# Playwright will handle its own chromium dependencies, but we also install wget, gnupg, etc.
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    apt-transport-https \
    curl \
    unzip \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

# Install Google Chrome for Selenium (Playwright uses its own Chromium)
RUN wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/google-chrome-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Set PYTHONPATH to include the backend folder
ENV PYTHONPATH=/app/backend:$PYTHONPATH

# Install Python requirements
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright and its Chromium browser
RUN pip install playwright
RUN playwright install --with-deps chromium

# Copy application files
COPY backend/ ./backend/
COPY --from=frontend-builder /app/dist /app/dist

# Ensure download directory exists
RUN mkdir -p /app/downloads && chmod 777 /app/downloads

# Expose FastAPI port
EXPOSE 5000

# Start FastAPI application
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "5000"]
