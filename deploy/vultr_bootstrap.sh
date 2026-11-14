#!/usr/bin/env bash
# One-shot setup for a fresh Ubuntu Vultr Cloud Compute instance. Run as root.
#   VERCEL_ORIGIN=https://your-app.vercel.app GROQ_API_KEY=... GEMINI_API_KEY=... \
#     bash deploy/vultr_bootstrap.sh
# Safe to re-run: existing secrets in .env are kept. Pass VERCEL_ORIGIN again to change CORS.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/VAL-Jerono/soma-pamoja-hackglobal.git}"
APP_DIR="${APP_DIR:-/opt/sp}"

if [ -f docker-compose.yml ] && [ -d api ]; then APP_DIR="$(pwd)"; fi

echo "==> packages and Docker"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y >/dev/null
apt-get install -y git curl ca-certificates openssl ufw >/dev/null
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh

echo "==> firewall (22, 80, 443 only; Postgres is never published)"
ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

echo "==> code"
if [ ! -f "$APP_DIR/docker-compose.yml" ]; then git clone "$REPO_URL" "$APP_DIR"; fi
cd "$APP_DIR"

echo "==> environment"
[ -f .env ] || cp .env.example .env
set_kv() { # set_kv KEY VALUE, safe for provider keys containing sed characters
  python3 - "$1" "$2" <<'PYSETKV'
from pathlib import Path
import sys
path = Path(".env")
key, value = sys.argv[1], sys.argv[2]
lines = path.read_text().splitlines() if path.exists() else []
updated = False
out = []
for line in lines:
    if line.startswith(key + "=") and not updated:
        out.append(key + "=" + value)
        updated = True
    elif line.startswith(key + "="):
        continue
    else:
        out.append(line)
if not updated:
    out.append(key + "=" + value)
path.write_text("\n".join(out) + "\n")
PYSETKV
}
get_kv() { grep "^$1=" .env | head -1 | cut -d= -f2-; }

[ "$(get_kv POSTGRES_PASSWORD)" != "sp" ] && [ -n "$(get_kv POSTGRES_PASSWORD)" ] || set_kv POSTGRES_PASSWORD "$(openssl rand -hex 24)"
[ -n "$(get_kv SECRET_KEY)" ] || set_kv SECRET_KEY "$(openssl rand -hex 32)"
NEW_PIN=""
if [ -z "$(get_kv FACILITATOR_PIN)" ]; then NEW_PIN="$(shuf -i 100000-999999 -n1)"; set_kv FACILITATOR_PIN "$NEW_PIN"; fi
set_kv DEV_FACILITATOR_OPEN 0
[ -z "${GROQ_API_KEY:-}" ] || set_kv GROQ_API_KEY "$GROQ_API_KEY"
[ -z "${GEMINI_API_KEY:-}" ] || set_kv GEMINI_API_KEY "$GEMINI_API_KEY"
[ -z "${VERCEL_ORIGIN:-}" ] || set_kv CORS_ORIGINS "${VERCEL_ORIGIN%/}"

IP="$(curl -4 -fsS https://ifconfig.me || true)"
[ -n "${SITE_ADDRESS_OVERRIDE:-}" ] && HOST="$SITE_ADDRESS_OVERRIDE" || HOST="$(echo "$IP" | tr . -).sslip.io"
set_kv SITE_ADDRESS "$HOST"
chmod 600 .env

echo "==> build and start"
docker compose up -d --build

echo "==> waiting for HTTPS (certificate issue can take up to a minute)"
ok=0
for i in $(seq 1 30); do
  if curl -fsS "https://$HOST/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 4
done

echo "==> nightly database backup (kept 7 days in /var/backups/sp)"
mkdir -p /var/backups/sp
cat > /etc/cron.d/sp-backup <<CRON
0 2 * * * root cd $APP_DIR && docker compose exec -T sp-db pg_dump -U sp sp | gzip > /var/backups/sp/sp-\$(date +\%F).sql.gz && find /var/backups/sp -name 'sp-*.sql.gz' -mtime +7 -delete
CRON

echo
if [ "$ok" = 1 ]; then echo "LIVE:  https://$HOST/health"; else echo "NOT YET HEALTHY. Check: docker compose logs sp-proxy sp-api"; fi
echo "VITE_API_BASE=https://$HOST"
[ -z "$NEW_PIN" ] || echo "FACILITATOR_PIN=$NEW_PIN   (shown once; it is also stored in $APP_DIR/.env)"
echo "CORS_ORIGINS=$(get_kv CORS_ORIGINS)"
