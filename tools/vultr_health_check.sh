#!/usr/bin/env bash
set -Eeuo pipefail

DISK_WARN_PERCENT="${DISK_WARN_PERCENT:-80}"
LOAD_WARN="${LOAD_WARN:-4.00}"
SERVICES="${SERVICES:-ssh cron}"
LOG_FILE="${LOG_FILE:-/var/log/soma-health-check.log}"

warnings=0

printf 'Soma Pamoja server health check\n'
printf 'Time: %s\n' "$(date --iso-8601=seconds)"
printf 'Host: %s\n\n' "$(hostname)"

disk_percent="$(df -P / | awk 'NR == 2 {gsub(/%/, "", $5); print $5}')"
memory_available_mb="$(free -m | awk '/^Mem:/ {print $7}')"
load_one="$(awk '{print $1}' /proc/loadavg)"
uptime_text="$(uptime -p)"

printf 'Disk usage: %s%%\n' "$disk_percent"
printf 'Memory available: %s MB\n' "$memory_available_mb"
printf 'Load average, 1 minute: %s\n' "$load_one"
printf 'Uptime: %s\n\n' "$uptime_text"

if (( disk_percent > DISK_WARN_PERCENT )); then
    printf 'WARNING: disk usage is %s%%, above %s%%\n' \
        "$disk_percent" "$DISK_WARN_PERCENT"
    warnings=$((warnings + 1))
else
    printf 'OK: disk usage is below %s%%\n' "$DISK_WARN_PERCENT"
fi

if awk -v load_value="$load_one" -v threshold="$LOAD_WARN" \
    'BEGIN { exit !(load_value > threshold) }'; then
    printf 'WARNING: 1-minute load is %s, above %s\n' \
        "$load_one" "$LOAD_WARN"
    warnings=$((warnings + 1))
else
    printf 'OK: 1-minute load is below %s\n' "$LOAD_WARN"
fi

for service in $SERVICES; do
    if systemctl is-active --quiet "$service"; then
        printf 'OK: service %s is active\n' "$service"
    else
        printf 'WARNING: service %s is not active\n' "$service"
        warnings=$((warnings + 1))
    fi
done

if (( warnings > 0 )); then
    printf '\nWARNING: %s health condition(s) need attention\n' "$warnings"
    exit 1
fi

printf '\nPASS: all health checks passed\n'
exit 0
