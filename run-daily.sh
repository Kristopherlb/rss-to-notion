#!/bin/bash
# Daily RSS to Notion sync
# Add to cron: 0 9 * * * /path/to/rss-to-notion/run-daily.sh >> /var/log/rss-to-notion.log 2>&1

cd "$(dirname "$0")"
echo "=== RSS to Notion Sync: $(date) ==="
npm start
echo "=== Completed: $(date) ==="
echo ""

