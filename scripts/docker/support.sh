# What the smoke runs share: failing with a reason, free ports, waiting for an address to answer, checking answers,
# and stopping a container the way a container platform does. Sourced by the scripts, never run.
# shellcheck shell=bash

# Prints the reason on stderr and ends the script (its EXIT trap cleans up).
fail() {
  echo "FAIL: $*" >&2
  exit 1
}

# A port nothing on this computer listens on now.
free_port() {
  node --eval 'const server = require("node:net").createServer().listen(0, "127.0.0.1", () => {
    console.log(server.address().port);
    server.close();
  });'
}

# Runs a command every half second until it succeeds, for up to a minute: `wait_until "<what>" <command...>`.
wait_until() {
  local what="$1" attempt
  shift
  for attempt in $(seq 1 120); do
    "$@" >/dev/null 2>&1 && return 0
    [ "$attempt" -lt 120 ] && sleep 0.5
  done
  fail "$what took more than a minute"
}

# The status code `curl` gets from an address, 000 when nothing answers. Extra arguments go to curl.
status_of() {
  local url="$1"
  shift
  curl --silent --output /dev/null --write-out "%{http_code}" --max-time 5 "$@" "$url" || true
}

# Waits up to a minute and a half for an address to answer with the status given, failing at once, with the container's
# log, if the container serving it stops.
wait_for_status() {
  local url="$1" expected="$2" container="$3" attempt
  for attempt in $(seq 1 180); do
    [ "$(status_of "$url")" = "$expected" ] && return 0
    if [ "$(docker inspect --format '{{.State.Running}}' "$container")" != "true" ]; then
      docker logs "$container" >&2 || true
      fail "$container stopped before $url answered $expected"
    fi
    [ "$attempt" -lt 180 ] && sleep 0.5
  done
  docker logs "$container" >&2 || true
  fail "$url didn't answer $expected within a minute and a half"
}

# Waits up to a minute for a line in a container's log.
wait_for_log() {
  local container="$1" line="$2" attempt logs
  for attempt in $(seq 1 120); do
    logs="$(docker logs "$container" 2>&1)"
    case "$logs" in *"$line"*) return 0 ;; esac
    [ "$(docker inspect --format '{{.State.Running}}' "$container")" = "true" ] || break
    [ "$attempt" -lt 120 ] && sleep 0.5
  done
  docker logs "$container" >&2 || true
  fail "$container never logged \"$line\""
}

# Expects an address to answer with the status given. Extra arguments go to curl.
expect_status() {
  local url="$1" expected="$2" actual
  shift 2
  actual="$(status_of "$url" "$@")"
  [ "$actual" = "$expected" ] || fail "$url answered $actual, not $expected"
  echo "ok: $url answers $expected"
}

# Expects a response header (headers as `curl --dump-header` writes them) to hold the value given.
expect_header() {
  local headers="$1" name="$2" value="$3" line
  line="$(grep --ignore-case "^$name:" "$headers" || true)"
  case "$line" in *"$value"*) ;; *) fail "the $name header doesn't hold \"$value\"" ;; esac
}

# Stops a container as a container platform does (SIGTERM, then SIGKILL after the grace period) and expects the
# process to have handled the SIGTERM: drained and exited with the code given (0 unless said), never killed (137).
stop_gracefully() {
  local container="$1" expected="${2:-0}" code
  docker stop --time 35 "$container" >/dev/null
  code="$(docker inspect --format '{{.State.ExitCode}}' "$container")"
  [ "$code" = "$expected" ] || {
    docker logs "$container" >&2 || true
    fail "$container exited $code on SIGTERM, not $expected"
  }
  echo "ok: $container drained and exited $expected on SIGTERM"
}
