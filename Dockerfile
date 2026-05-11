# Build frontend assets
FROM node:20-bullseye-slim AS frontend-builder

WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

# Use Python 3.11 slim image
FROM python:3.11-slim

# Install system dependencies including Chrome
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    apt-transport-https \
    && rm -rf /var/lib/apt/lists/* \
    && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/google-chrome-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Set PYTHONPATH to include backend folder
ENV PYTHONPATH=/app/backend:$PYTHONPATH

# Copy requirements and install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Copy built frontend bundle for FastAPI SPA serving
COPY --from=frontend-builder /app/dist /app/dist

# Expose port
EXPOSE 5000

# Run the application with Uvicorn
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "5000"]