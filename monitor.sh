#!/bin/bash
cd /home/ubuntu/clawd/projects/polymarket-btc15m

# Check if bot is running
if [ -f logs/bot.pid ]; then
    PID=$(cat logs/bot.pid)
    if ps -p $PID > /dev/null 2>&1; then
        echo "✅ Bot running (PID: $PID)"
        echo ""
        tail -20 logs/bot.log
        exit 0
    fi
fi

echo "⚠️ Bot not running, restarting..."
nohup node src/index.js > logs/bot.log 2>&1 &
echo $! > logs/bot.pid
echo "✅ Restarted with PID: $(cat logs/bot.pid)"
