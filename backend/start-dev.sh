#!/bin/bash
# Quick start script for CodeMap development (macOS/Linux)
# Run from backend directory: ./start-dev.sh

echo ""
echo "====================================="
echo "  CodeMap Development Environment"
echo "====================================="
echo ""

# Check if services are already running
if lsof -Pi :5001 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "[WARNING] Port 5001 already in use. Mock service may already be running."
    echo ""
fi

if lsof -Pi :5000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "[WARNING] Port 5000 already in use. Backend may already be running."
    echo ""
fi

echo "Starting services..."
echo ""

# Get the backend directory path
BACKEND_DIR="$PWD"
MOCK_DIR="$(dirname "$BACKEND_DIR")/mock-service"

# Start mock service
echo "[1/2] Starting Mock Embedding Service..."
osascript -e "tell app \"Terminal\" to do script \"cd '$MOCK_DIR' && source .venv/bin/activate && python app.py\""
sleep 2

# Start backend
echo "[2/2] Starting Backend API..."
osascript -e "tell app \"Terminal\" to do script \"cd '$BACKEND_DIR' && npm run dev\""
sleep 3

echo ""
echo "====================================="
echo "Services starting in new terminals:"
echo "  Mock Service: http://localhost:5001"
echo "  Backend API:  http://localhost:5000"
echo "====================================="
echo ""
echo "To run tests: npm test"
echo "  or: node tests/integration.spec.js"
echo ""
