# ── Stage 1: Build Node.js TypeScript ────────────────────────────────────────
FROM node:20-slim AS node-builder

WORKDIR /build/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

# ── Stage 2: Runtime (Python + Node.js) ──────────────────────────────────────
FROM python:3.11-slim

# Install Node.js 20 into the Python image
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc \
    g++ \
    libpq-dev \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# ── Python RAG pipeline ───────────────────────────────────────────────────────
WORKDIR /app/rag-pipeline
COPY rag-pipeline/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY rag-pipeline/ ./

# ── Node.js backend ───────────────────────────────────────────────────────────
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps
COPY --from=node-builder /build/backend/dist ./dist

# ── Startup script ────────────────────────────────────────────────────────────
WORKDIR /app
COPY start.sh ./
RUN chmod +x start.sh

ENV PORT=5000
ENV RAG_SERVICE_URL=http://localhost:5001

EXPOSE 5000

CMD ["./start.sh"]
