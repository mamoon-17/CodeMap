# Use slim Python image
FROM python:3.11-slim

WORKDIR /app

# System deps needed for some Python packages (e.g. psycopg2, chromadb)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first (layer caching)
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY . .

# ChromaDB persists to this volume-mounted path
VOLUME ["/app/chroma_db"]

EXPOSE 5001

CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5001", "--log-level", "info"]
