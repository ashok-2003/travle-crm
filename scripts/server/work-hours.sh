#!/usr/bin/env bash
# Working hours for the background work (docs/runbook.md, "Two small servers"): the worker on the api's server, the
# console on the console's (both on one server), run between the hours set, India time, and stop outside them, so a
# managed database that sleeps when idle sleeps at night. The api never stops. Work that comes due at night waits for
# the morning: listeners' work (invite emails, notifications, imports) and each schedule's missed run, sent once. As root:
#   work-hours.sh set <start HH:MM> <end HH:MM>   two timers start and stop them every day; the hours apply at once
#   work-hours.sh off                             removes the timers and starts them for good
#   work-hours.sh apply                           starts or stops them for the time now (deploy.sh, and at boot)
#   work-hours.sh start | stop                    what the timers run
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/server/paths.sh

hours_file=/etc/travel-crm/work-hours
zone=Asia/Kolkata
units=/etc/systemd/system

fail() {
  echo "$*" >&2
  exit 1
}

# The services this server runs only in working hours.
services_here() {
  case "$(server_role)" in
    api) echo worker ;;
    console) echo console ;;
    *) echo worker console ;;
  esac
}

start_services() {
  local services
  read -r -a services <<<"$(services_here)"
  scripts/server/compose.sh up --detach --no-deps "${services[@]}"
}

stop_services() {
  local services
  read -r -a services <<<"$(services_here)"
  scripts/server/compose.sh stop "${services[@]}"
}

# Starts them inside the hours, stops them outside; does nothing when no hours are set.
apply() {
  if [ ! -f "$hours_file" ]; then
    echo "No working hours set: the background work runs all day"
    return
  fi
  local start end now
  read -r start end <"$hours_file"
  now="$(TZ="$zone" date +%H%M)"
  if [ "$now" -ge "${start/:/}" ] && [ "$now" -lt "${end/:/}" ]; then
    echo "Inside the working hours ($start to $end, India time): starting $(services_here)"
    start_services
  else
    echo "Outside the working hours ($start to $end, India time): stopping $(services_here)"
    stop_services
  fi
}

# One timer: runs travel-crm-work-<what>.service every day at <time> India time. Not persistent: at boot,
# travel-crm-work-hours.service applies the hours instead, so a server off at both times doesn't run both.
write_timer() {
  local what="$1" time="$2"
  cat >"$units/travel-crm-work-$what.timer" <<EOF
# Written by scripts/server/work-hours.sh: $what the background work at $time India time.
[Unit]
Description=travel-crm working hours: $what the background work at $time India time

[Timer]
OnCalendar=*-*-* $time:00 $zone

[Install]
WantedBy=timers.target
EOF
}

set_hours() {
  local start="${1:-}" end="${2:-}" time
  for time in "$start" "$end"; do
    [[ "$time" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]] || fail "Usage: work-hours.sh set <start HH:MM> <end HH:MM>"
  done
  [ "${start/:/}" -lt "${end/:/}" ] || fail "The hours must start before they end, within one day: $start to $end"
  install -d -m 0755 /etc/travel-crm
  echo "$start $end" >"$hours_file"
  install -m 0644 scripts/server/systemd/travel-crm-work-start.service scripts/server/systemd/travel-crm-work-stop.service \
    scripts/server/systemd/travel-crm-work-hours.service "$units/"
  write_timer start "$start"
  write_timer stop "$end"
  systemctl daemon-reload
  systemctl enable --quiet --now travel-crm-work-start.timer travel-crm-work-stop.timer
  systemctl enable --quiet travel-crm-work-hours.service
  echo "Working hours: $start to $end, India time"
  apply
}

off() {
  systemctl disable --quiet --now travel-crm-work-start.timer travel-crm-work-stop.timer 2>/dev/null || true
  systemctl disable --quiet travel-crm-work-hours.service 2>/dev/null || true
  rm -f "$units"/travel-crm-work-{start,stop}.{timer,service} "$units/travel-crm-work-hours.service" "$hours_file"
  systemctl daemon-reload
  echo "No working hours: the background work runs all day"
  start_services
}

[ "$(id -u)" = 0 ] || fail "Run it as root (sudo)."
command="${1:-}"
if [ "$#" -gt 0 ]; then shift; fi
case "$command" in
  set) set_hours "$@" ;;
  off) off ;;
  apply) apply ;;
  start) start_services ;;
  stop) stop_services ;;
  *) fail "Usage: work-hours.sh <set <start HH:MM> <end HH:MM> | off | apply | start | stop>" ;;
esac
