#!/bin/sh
set -e

echo "Starting Python RAG service..."
cd /app/rag-pipeline
python -m uvicorn app:app --host 0.0.0.0 --port 5001 --log-level info &
RAG_PID=$!

# Give the RAG service a moment to boot before Node tries to connect
echo "Waiting for RAG service to be ready..."
sleep 5

echo "Starting Node.js backend..."
cd /app/backend
node dist/server.js &
NODE_PID=$!

# If either process exits, kill both and exit
wait -n
kill $RAG_PID $NODE_PID 2>/dev/null
