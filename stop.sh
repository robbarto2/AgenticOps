#!/bin/bash
# AgenticOps - Stop Backend and Frontend Servers

echo "⏹️  Stopping AgenticOps..."

# Kill backend
if lsof -ti:8080 > /dev/null 2>&1; then
    lsof -ti:8080 | xargs kill 2>/dev/null
    echo "   ✅ Backend stopped"
else
    echo "   ℹ️  Backend not running"
fi

# Kill frontend
if lsof -ti:5173 > /dev/null 2>&1; then
    lsof -ti:5173 | xargs kill 2>/dev/null
    echo "   ✅ Frontend stopped"
else
    echo "   ℹ️  Frontend not running"
fi

echo ""
echo "✅ AgenticOps stopped"
