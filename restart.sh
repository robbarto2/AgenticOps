#!/bin/bash
# AgenticOps - Restart Backend and Frontend Servers

set -e

PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

echo "🔄 Restarting AgenticOps..."
echo ""

# Kill existing processes
echo "⏹️  Stopping existing servers..."
lsof -ti:8080 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
sleep 2

# Start backend
echo "🚀 Starting backend (port 8080)..."
cd "$BACKEND_DIR"
source .venv/bin/activate
python main.py > /tmp/agenticops-backend.log 2>&1 &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"

# Wait a moment for backend to start
sleep 3

# Check backend health
if curl -s http://localhost:8080/api/health > /dev/null 2>&1; then
    echo "   ✅ Backend is healthy"
else
    echo "   ❌ Backend health check failed"
    echo "   Check logs: tail -f /tmp/agenticops-backend.log"
    exit 1
fi

# Start frontend
echo "🚀 Starting frontend (port 5173)..."
cd "$FRONTEND_DIR"
npm run dev > /tmp/agenticops-frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"

sleep 3

# Check frontend
if curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ | grep -q "200"; then
    echo "   ✅ Frontend is running"
else
    echo "   ⚠️  Frontend may still be starting..."
fi

echo ""
echo "✨ AgenticOps is running!"
echo ""
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:8080"
echo ""
echo "Logs:"
echo "   Backend:  tail -f /tmp/agenticops-backend.log"
echo "   Frontend: tail -f /tmp/agenticops-frontend.log"
echo ""
echo "To stop: lsof -ti:8080 | xargs kill && lsof -ti:5173 | xargs kill"
