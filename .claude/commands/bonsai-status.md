Show the current status of all bonsai pm2 processes.

Run: `pm2 list | grep -E "bonsai|App name|─"`

Then run: `pm2 show bonsai-prod 2>/dev/null | grep -E "status|uptime|restarts|pid"` and `pm2 show bonsai-dev 2>/dev/null | grep -E "status|uptime|restarts|pid"`

Report which processes are online, their uptime, and any recent restarts.
