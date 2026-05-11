#!/bin/sh
set -e

echo "Starting Python RAG service..."
cd /app/rag-pipeline
python -m uvicorn app:app --host 0.0.0.0 --port 5001 --log-level info &

# Give the RAG service time to boot before Node tries to connect
echo "Waiting for RAG service to be ready..."
sleep 5

echo "Starting Node.js backend..."
cd /app/backend
exec node dist/server.js
