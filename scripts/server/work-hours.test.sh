#!/usr/bin/env bash
# `pnpm scripts:test`: the working hours' plan (scripts/server/work-hours.sh), sourced, with its plan in a file of the
# test's own: the first version's one line reads as those hours with the default night bursts; a plan written reads back
# the same; a minute is in the hours, in a burst (across midnight too) or in neither; and a burst that runs into the
# hours, a burst of the wrong length or a time that isn't one is refused. No root, systemd or Docker: nothing is started.
set -euo pipefail
cd "$(dirname "$0")/../.."
source scripts/docker/support.sh

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
export WORK_HOURS_PLAN="$work/work-hours"
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

# No plan at all: no hours.
rm -f "$WORK_HOURS_PLAN"
read_plan
check "no plan means no hours" [ -z "$hours_start" ]

# A plan written reads back the same.
hours_start=08:30
hours_end=18:00
bursts=21:00,00:30
burst_minutes=15
write_plan
read_plan
check "a written plan reads back the same" \
  [ "$hours_start $hours_end $bursts $burst_minutes" = "08:30 18:00 21:00,00:30 15" ]
bursts=off
write_plan
read_plan
check "bursts off reads back off" [ "$bursts" = off ]

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
refused "a time that isn't one" valid_time 24:00
refused "a time without its leading zero" valid_time 9:00
check "a time" valid_time 07:00
