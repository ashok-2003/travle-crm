#!/usr/bin/env bash
# `pnpm scripts:test`: the working hours (scripts/server/work-hours.sh), sourced, with a plan, a settings file, a
# console-mode file, a signal file and a compose command of the test's own: the first version's one line reads as those
# hours with the default night bursts and wake; a plan written reads back the same; a minute is in the hours, in a burst
# (across midnight too) or in neither; a burst that runs into the hours or a time that isn't one is refused; the day's
# and the night's states run what each server's role calls for; and work the api signalled in the wake's minutes keeps
# the night's worker running. No root, systemd or Docker: the compose command only records.
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/docker/support.sh

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
export WORK_HOURS_PLAN="$work/work-hours"
export TRAVEL_CRM_SETTINGS="$work/production.env"
export TRAVEL_CRM_CONSOLE_JOBS="$work/console-jobs"
export TRAVEL_CRM_WORK_SIGNAL="$work/work-signal"
# What the states ask Compose for, a line each.
export WORK_HOURS_COMPOSE="$work/compose"
printf '#!/usr/bin/env bash\necho "$*" >>"%s"\n' "$work/compose.log" >"$WORK_HOURS_COMPOSE"
chmod +x "$WORK_HOURS_COMPOSE"
# shellcheck source=scripts/server/work-hours.sh
source scripts/server/work-hours.sh

check() {
  local what="$1"
  shift
  "$@" || fail "$what"
  echo "ok: $what"
}
refused() {
  local what="$1"
  shift
  if ("$@") >/dev/null 2>&1; then fail "$what: it was allowed"; fi
  echo "ok: $what"
}

# The first version's plan: one line, the hours.
echo "09:00 19:00" >"$WORK_HOURS_PLAN"
read_plan
check "the first version's line reads as the hours" [ "$hours_start $hours_end" = "09:00 19:00" ]
check "with the default night bursts" [ "$bursts $burst_minutes" = "22:00,01:00,04:00,07:00 10" ]
check "and the default wake" [ "$wake_minutes" = 5 ]

# No plan at all: no hours.
rm -f "$WORK_HOURS_PLAN"
read_plan
check "no plan means no hours" [ -z "$hours_start" ]

# A plan written reads back the same.
hours_start=08:30
hours_end=18:00
bursts=21:00,00:30
burst_minutes=15
wake_minutes=8
write_plan
read_plan
check "a written plan reads back the same" \
  [ "$hours_start $hours_end $bursts $burst_minutes $wake_minutes" = "08:30 18:00 21:00,00:30 15 8" ]
bursts=off
wake_minutes=off
write_plan
read_plan
check "bursts off reads back off" [ "$bursts" = off ]
check "and so does the wake" [ "$wake_minutes" = off ]
printf 'hours 09:00 19:00\nbursts 22:00 10\n' >"$WORK_HOURS_PLAN"
read_plan
check "a plan from before the wake has the default wake" [ "$wake_minutes" = 5 ]

# Which minutes fall where, with the default plan.
hours_start=09:00
hours_end=19:00
bursts=22:00,01:00,04:00,07:00
burst_minutes=10
check "09:00 is in the hours" in_hours "$(minutes_of 09:00)"
check "18:59 is in the hours" in_hours "$(minutes_of 18:59)"
refused "19:00 is not in the hours" in_hours "$(minutes_of 19:00)"
refused "08:59 is not in the hours" in_hours "$(minutes_of 08:59)"
check "22:00 is in a burst" in_burst "$(minutes_of 22:00)"
check "22:09 is in a burst" in_burst "$(minutes_of 22:09)"
refused "22:10 is not in a burst" in_burst "$(minutes_of 22:10)"
refused "23:00 is not in a burst" in_burst "$(minutes_of 23:00)"
check "07:05 is in a burst" in_burst "$(minutes_of 07:05)"
bursts=23:55
check "a burst from 23:55 still runs at 00:04" in_burst "$(minutes_of 00:04)"
refused "and is over at 00:05" in_burst "$(minutes_of 00:05)"
bursts=off
refused "no burst when they're off" in_burst "$(minutes_of 22:00)"

# What's refused.
bursts=22:00,01:00,04:00,07:00
check "the default bursts fall outside 09:00 to 19:00" check_bursts_outside_hours
bursts=08:55
refused "a burst that runs into the hours" check_bursts_outside_hours
bursts=18:30
refused "a burst that starts in the hours" check_bursts_outside_hours
bursts=19:00
check "a burst from the hours' end" check_bursts_outside_hours
hours_start=09:00
hours_end=09:30
bursts=08:50
burst_minutes=60
refused "a burst that spans short hours" check_bursts_outside_hours
refused "a time that isn't one" valid_time 24:00
refused "a time without its leading zero" valid_time 9:00
check "a time" valid_time 07:00

# What each state runs, by the server's role. `asked` is what Compose was asked for since the last look.
asked() {
  paste -s -d '|' "$work/compose.log" 2>/dev/null || true
  rm -f "$work/compose.log"
}
console_mode() { cat "$TRAVEL_CRM_CONSOLE_JOBS" 2>/dev/null || echo unset; }
role() {
  echo "SERVER_ROLE='$1'" >"$TRAVEL_CRM_SETTINGS"
  rm -f "$TRAVEL_CRM_CONSOLE_JOBS" "$work/compose.log"
}

role api
day_state >/dev/null
check "the api's server, by day: the worker runs" [ "$(asked)" = "up --detach --no-deps worker" ]
night_state >/dev/null
check "the api's server, at night: the worker stops" [ "$(asked)" = "stop worker" ]
check "and it keeps no console mode" [ "$(console_mode)" = unset ]

role console
day_state >/dev/null
check "the console's server, by day: the console runs with its jobs" \
  [ "$(asked) $(console_mode)" = "up --detach --no-deps console on" ]
night_state >/dev/null
check "the console's server, at night: the console runs, its jobs off" \
  [ "$(asked) $(console_mode)" = "up --detach --no-deps console off" ]

role all
day_state >/dev/null
check "one server, by day: both run, the console with its jobs" \
  [ "$(asked) $(console_mode)" = "up --detach --no-deps worker console on" ]
night_state >/dev/null
check "one server, at night: the worker stops, the console runs, its jobs off" \
  [ "$(asked) $(console_mode)" = "stop worker|up --detach --no-deps console off" ]

# The state the time calls for, with the default plan.
role console
hours_start=09:00
hours_end=19:00
bursts=22:00,01:00,04:00,07:00
burst_minutes=10
state_at() {
  WORK_HOURS_NOW="$1" apply_state >/dev/null
  console_mode
}
check "at 10:00, the day's state" [ "$(state_at 10:00)" = on ]
check "at 22:05, a burst's: the day's" [ "$(state_at 22:05)" = on ]
check "at 23:00, the night's" [ "$(state_at 23:00)" = off ]
check "at 08:30, still the night's" [ "$(state_at 08:30)" = off ]
hours_start=""
check "with no plan, the day's at any time" [ "$(state_at 03:00)" = on ]

# Work the api signalled (its file modified in the wake's last minutes) keeps the night's worker running.
role api
hours_start=09:00
hours_end=19:00
bursts=22:00,01:00,04:00,07:00
burst_minutes=10
wake_minutes=5
rm -f "$TRAVEL_CRM_WORK_SIGNAL"
refused "no signal file: no work signalled" signalled
touch -t 202001010000 "$TRAVEL_CRM_WORK_SIGNAL"
refused "a signal from long ago: none" signalled
touch "$TRAVEL_CRM_WORK_SIGNAL"
check "a signal just now: work signalled" signalled
WORK_HOURS_NOW=23:00 apply_state >/dev/null
check "at 23:00 with work just signalled, the api's server runs the worker" \
  [ "$(asked)" = "up --detach --no-deps worker" ]
stop >/dev/null
check "and the hours' end keeps it running" [ "$(asked)" = "up --detach --no-deps worker" ]
echo "wake off" >>"$WORK_HOURS_PLAN"
read_plan
refused "with the wake off, a signal just now counts for nothing" signalled
rm -f "$WORK_HOURS_PLAN"
touch -t 202001010000 "$TRAVEL_CRM_WORK_SIGNAL"
read_plan
hours_start=09:00
hours_end=19:00
WORK_HOURS_NOW=23:00 apply_state >/dev/null
check "at 23:00 once it's quiet, the worker stops" [ "$(asked)" = "stop worker" ]
role all
touch "$TRAVEL_CRM_WORK_SIGNAL"
WORK_HOURS_NOW=23:00 apply_state >/dev/null
check "one server, woken at night: the worker runs, the console's jobs stay off" \
  [ "$(asked) $(console_mode)" = "up --detach --no-deps worker|up --detach --no-deps console off" ]
