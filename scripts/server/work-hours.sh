#!/usr/bin/env bash
# Working hours and night bursts for the background work (docs/runbook.md, "Working hours and night bursts"), so a
# managed database that sleeps after 5 idle minutes (Neon's free plan) sleeps most of the night:
# - in the working hours (India time) everything runs: the worker on the api's server, the console with its jobs;
# - outside them the worker stops and the console keeps serving its pages with its jobs off (CONSOLE_JOBS=off);
# - at each night burst (by default 22:00, 01:00, 04:00 and 07:00, 10 minutes each) the day's state comes back for the
#   burst's minutes: what came due in the night (invite emails, notifications, imports' steps, each schedule's missed
#   run, sent once) is done, and the night's state returns.
# The api never stops. As root:
#   work-hours.sh set <start HH:MM> <end HH:MM>      the working hours; the night bursts stay as they are
#   work-hours.sh bursts <HH:MM,HH:MM,...> <minutes> the night bursts: when (outside the hours) and how long (1-120)
#   work-hours.sh bursts off                         no night bursts: the night's work waits for the morning
#   work-hours.sh off                                no working hours: everything runs all day and night
#   work-hours.sh status                             the plan, what runs now, and the timers' next runs
#   work-hours.sh apply                              writes the timers for the plan and starts or stops the work for the
#                                                    time now (deploy.sh, and at boot)
#   work-hours.sh start | stop | burst               what the timers run: the day's state, the night's, a burst
# scripts/server/work-hours.test.sh sources it (`pnpm scripts:test`): for it, WORK_HOURS_PLAN names another plan,
# WORK_HOURS_COMPOSE another compose command and WORK_HOURS_NOW the time (HH:MM, India time).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
source scripts/server/paths.sh

zone=Asia/Kolkata
units=/etc/systemd/system
compose="${WORK_HOURS_COMPOSE:-scripts/server/compose.sh}"
# The plan: `hours <start> <end>` and `bursts <times|off> <minutes>`. A file of one line `<start> <end>` (this script's
# first version) reads as those hours with the default bursts, and is rewritten the first time anything is set.
plan_file="${WORK_HOURS_PLAN:-/etc/travel-crm/work-hours}"
default_bursts="22:00,01:00,04:00,07:00"
default_burst_minutes=10

fail() {
  echo "$*" >&2
  exit 1
}

# --- The plan -------------------------------------------------------------------------------------------------------

hours_start=""
hours_end=""
bursts=""
burst_minutes=""

read_plan() {
  hours_start=""
  hours_end=""
  bursts="$default_bursts"
  burst_minutes="$default_burst_minutes"
  [ -f "$plan_file" ] || return 0
  local key first second
  while read -r key first second; do
    case "$key" in
      hours)
        hours_start="$first"
        hours_end="$second"
        ;;
      bursts)
        bursts="$first"
        burst_minutes="${second:-$default_burst_minutes}"
        ;;
      [0-2][0-9]:[0-5][0-9])
        hours_start="$key"
        hours_end="$first"
        ;;
    esac
  done <"$plan_file"
}

write_plan() {
  install -d -m 0755 "$(dirname "$plan_file")"
  printf 'hours %s %s\nbursts %s %s\n' "$hours_start" "$hours_end" "$bursts" "$burst_minutes" >"$plan_file"
}

# Minutes since midnight of an HH:MM time.
minutes_of() {
  local time="$1"
  echo $((10#${time%%:*} * 60 + 10#${time##*:}))
}

now_minutes() {
  minutes_of "${WORK_HOURS_NOW:-$(TZ="$zone" date +%H:%M)}"
}

# Whether a minute of the day falls in [from, from + length), across midnight too.
within() {
  local minute="$1" from="$2" length="$3"
  [ $(((minute - from + 1440) % 1440)) -lt "$length" ]
}

in_hours() {
  local minute="$1" start end
  start="$(minutes_of "$hours_start")"
  end="$(minutes_of "$hours_end")"
  within "$minute" "$start" $((end - start))
}

# Whether the minute falls in one of the night bursts.
in_burst() {
  local minute="$1" time
  [ "$bursts" != off ] || return 1
  for time in ${bursts//,/ }; do
    if within "$minute" "$(minutes_of "$time")" "$burst_minutes"; then return 0; fi
  done
  return 1
}

valid_time() {
  [[ "$1" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]]
}

# Every minute of every burst must fall outside the working hours.
check_bursts_outside_hours() {
  local time from offset
  [ "$bursts" != off ] || return 0
  for time in ${bursts//,/ }; do
    from="$(minutes_of "$time")"
    for ((offset = 0; offset < burst_minutes; offset++)); do
      if in_hours $(((from + offset) % 1440)); then
        fail "The burst at $time ($burst_minutes minutes) runs into the working hours ($hours_start to $hours_end):" \
          "move the bursts first (work-hours.sh bursts <HH:MM,...> <minutes>, or bursts off)"
      fi
    done
  done
}

# --- What runs ------------------------------------------------------------------------------------------------------

# Whether this server runs the worker, the console, or both.
runs_worker() { [ "$(server_role)" != console ]; }
runs_console() { [ "$(server_role)" != api ]; }

set_console_jobs() {
  install -d -m 0755 "$(dirname "$console_jobs_file")"
  echo "$1" >"$console_jobs_file"
}

# The day's state (a burst's too, and no plan's): the worker runs, the console runs with its jobs. The console's mode
# is kept in console_jobs_file, which compose.sh hands to Compose, so any `compose.sh up` keeps it; a change recreates
# the console's container (its pages are away for the half minute it takes to start).
day_state() {
  local services=()
  if runs_worker; then services+=(worker); fi
  if runs_console; then
    set_console_jobs on
    services+=(console)
  fi
  "$compose" up --detach --no-deps "${services[@]}"
}

# The night's state: the worker stops (its running jobs get the stop's grace, 2 minutes, to finish; one cut short runs
# again later, as pg-boss retries it), and the console serves its pages with its jobs off.
night_state() {
  if runs_worker; then "$compose" stop worker; fi
  if runs_console; then
    set_console_jobs off
    "$compose" up --detach --no-deps console
  fi
}

what_runs_here() {
  case "$(server_role)" in
    api) echo "the worker" ;;
    console) echo "the console with its jobs" ;;
    *) echo "the worker and the console with its jobs" ;;
  esac
}

what_sleeps_here() {
  case "$(server_role)" in
    api) echo "the worker stops" ;;
    console) echo "the console serves its pages with its jobs off" ;;
    *) echo "the worker stops; the console serves its pages with its jobs off" ;;
  esac
}

describe_plan() {
  if [ -z "$hours_start" ]; then
    echo "No working hours: the background work runs all day and night"
  elif [ "$bursts" = off ]; then
    echo "Working hours $hours_start to $hours_end, India time; no night bursts"
  else
    echo "Working hours $hours_start to $hours_end, India time; night bursts at $bursts for $burst_minutes minutes"
  fi
}

# The state the time now calls for: the day's in the hours or a burst (or with no plan), else the night's.
apply_state() {
  local minute
  minute="$(now_minutes)"
  if [ -z "$hours_start" ]; then
    echo "No working hours: running $(what_runs_here)"
    day_state
  elif in_hours "$minute"; then
    echo "Inside the working hours ($hours_start to $hours_end): running $(what_runs_here)"
    day_state
  elif in_burst "$minute"; then
    echo "Inside a night burst (one of $bursts, $burst_minutes minutes): running $(what_runs_here)"
    day_state
  else
    echo "Night ($hours_end to $hours_start, India time): $(what_sleeps_here)"
    night_state
  fi
}

# --- Timers ---------------------------------------------------------------------------------------------------------

unit_changed=""

# Writes a unit only when it differs, so `apply` on every deploy reloads systemd only after a change.
put_unit() {
  local name="$1" content="$2"
  if [ ! -f "$units/$name" ] || [ "$(cat "$units/$name")" != "$content" ]; then
    printf '%s\n' "$content" >"$units/$name"
    unit_changed="yes"
  fi
}

# A timer that runs travel-crm-work-<what>.service at each of the times, India time. Not persistent: at boot,
# travel-crm-work-hours.service applies the plan instead, so a server that was off doesn't run what it missed.
timer_unit() {
  local description="$1" time
  shift
  printf '# Written by scripts/server/work-hours.sh from %s.\n' "$plan_file"
  printf '[Unit]\nDescription=travel-crm %s\n\n[Timer]\n' "$description"
  for time in "$@"; do
    printf 'OnCalendar=*-*-* %s:00 %s\n' "$time" "$zone"
  done
  # On the minute, not within systemd's default minute of it.
  printf 'AccuracySec=1s\n\n[Install]\nWantedBy=timers.target'
}

# The plan's timers and services: the hours' start and end, the bursts, and the state at boot.
write_units() {
  local service burst_times
  for service in travel-crm-work-start.service travel-crm-work-stop.service travel-crm-work-burst.service \
    travel-crm-work-hours.service; do
    put_unit "$service" "$(cat "scripts/server/systemd/$service")"
  done
  put_unit travel-crm-work-start.timer \
    "$(timer_unit "working hours: the background work from $hours_start India time" "$hours_start")"
  put_unit travel-crm-work-stop.timer \
    "$(timer_unit "working hours: the night's state from $hours_end India time" "$hours_end")"
  if [ "$bursts" = off ]; then
    if [ -f "$units/travel-crm-work-burst.timer" ]; then
      systemctl disable --quiet --now travel-crm-work-burst.timer 2>/dev/null || true
      rm -f "$units/travel-crm-work-burst.timer"
      unit_changed="yes"
    fi
  else
    read -r -a burst_times <<<"${bursts//,/ }"
    put_unit travel-crm-work-burst.timer "$(timer_unit \
      "night bursts: the background work for $burst_minutes minutes at $bursts India time" "${burst_times[@]}")"
  fi
  if [ -n "$unit_changed" ]; then systemctl daemon-reload; fi
  systemctl enable --quiet travel-crm-work-start.timer travel-crm-work-stop.timer travel-crm-work-hours.service
  # Restarted, not started: a rewritten timer must read its new times.
  systemctl restart travel-crm-work-start.timer travel-crm-work-stop.timer
  if [ "$bursts" != off ]; then
    systemctl enable --quiet travel-crm-work-burst.timer
    systemctl restart travel-crm-work-burst.timer
  fi
}

remove_units() {
  systemctl disable --quiet --now travel-crm-work-start.timer travel-crm-work-stop.timer \
    travel-crm-work-burst.timer 2>/dev/null || true
  systemctl disable --quiet travel-crm-work-hours.service 2>/dev/null || true
  rm -f "$units"/travel-crm-work-{start,stop,burst}.{timer,service} "$units/travel-crm-work-hours.service"
  systemctl daemon-reload
}

# --- Commands -------------------------------------------------------------------------------------------------------

apply() {
  read_plan
  if [ -n "$hours_start" ]; then write_units; fi
  apply_state
}

set_hours() {
  local start="${1:-}" end="${2:-}"
  if ! valid_time "$start" || ! valid_time "$end"; then fail "Usage: work-hours.sh set <start HH:MM> <end HH:MM>"; fi
  [ "$(minutes_of "$start")" -lt "$(minutes_of "$end")" ] ||
    fail "The hours must start before they end, within one day: $start to $end"
  read_plan
  hours_start="$start"
  hours_end="$end"
  check_bursts_outside_hours
  write_plan
  describe_plan
  apply
}

set_bursts() {
  local times="${1:-}" minutes="${2:-$default_burst_minutes}" time
  read_plan
  [ -n "$hours_start" ] || fail "Set the working hours first: work-hours.sh set <start HH:MM> <end HH:MM>"
  if [ "$times" = off ]; then
    bursts=off
  else
    [ -n "$times" ] || fail "Usage: work-hours.sh bursts <HH:MM,HH:MM,...> <minutes> | bursts off"
    for time in ${times//,/ }; do
      valid_time "$time" || fail "Not a time (HH:MM): $time"
    done
    if ! [[ "$minutes" =~ ^[0-9]+$ ]] || [ "$minutes" -lt 1 ] || [ "$minutes" -gt 120 ]; then
      fail "A burst lasts 1 to 120 minutes, not '$minutes'"
    fi
    bursts="$times"
    burst_minutes="$minutes"
  fi
  check_bursts_outside_hours
  write_plan
  describe_plan
  apply
}

off() {
  remove_units
  rm -f "$plan_file"
  echo "No working hours: the background work runs all day and night"
  day_state
}

# A burst: the day's state for its minutes, then whatever the time calls for. travel-crm-work-burst.service runs it
# and waits for it.
burst() {
  read_plan
  echo "Night burst: running $(what_runs_here) for $burst_minutes minutes"
  day_state
  sleep $((burst_minutes * 60))
  apply_state
}

status() {
  local state=()
  read_plan
  describe_plan
  if runs_worker; then
    if [ -n "$("$compose" ps --quiet --status running worker 2>/dev/null)" ]; then
      state+=("worker running")
    else
      state+=("worker stopped")
    fi
  fi
  if runs_console; then state+=("console running, its jobs $(cat "$console_jobs_file" 2>/dev/null || echo on)"); fi
  echo "This server ($(server_role)) now: ${state[0]}${state[1]:+; ${state[1]}}"
  systemctl list-timers --all --no-pager 'travel-crm-work-*' 2>/dev/null || true
}

main() {
  [ "$(id -u)" = 0 ] || fail "Run it as root (sudo)."
  local command="${1:-}"
  if [ "$#" -gt 0 ]; then shift; fi
  case "$command" in
    set) set_hours "$@" ;;
    bursts) set_bursts "$@" ;;
    off) off ;;
    apply) apply ;;
    status) status ;;
    start) day_state ;;
    stop) night_state ;;
    burst) burst ;;
    *) fail "Usage: work-hours.sh <set <start> <end> | bursts <HH:MM,...> <minutes> | bursts off | off | status | apply>" ;;
  esac
}

# Run, not sourced by its test.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
