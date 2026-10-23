"use client";

// Check now for a connected source (Sheets S37, S41; Meta Pages): reads it at once. It says "Checking…" while the request
// is out or a check runs, says "Checked at …" in a polite status line when the new check ends, and shows the refusal's own
// sentence for a second press ("Just checked"). The caller names its request and its words; the polling is the same.
import { useEffect, useId, useState } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { lastCheckedText } from "./last-checked";

export function CheckNowButton({
  lastCheckedAt,
  checkRunning,
  canCheck,
  action,
  checking: checkingWord,
  checkedAt: checkedAtWord,
  check,
  pending,
  error,
  refresh,
}: {
  lastCheckedAt: string | null;
  checkRunning: boolean;
  /** The source is in a state that can be read (running). */
  canCheck: boolean;
  /** "Sync now" or "Check now". */
  action: string;
  /** "Checking…". */
  checking: string;
  /** "Checked at {when}", given the time as the agency's clock shows it. */
  checkedAt: (when: string) => string;
  /** Sends the request; the button waits for the worker's check after it. */
  check: () => Promise<unknown>;
  pending: boolean;
  error: unknown;
  /** Loads the source again, which moves its last check. */
  refresh: () => Promise<unknown>;
}) {
  const write = useWriteAccess("change");
  const hintId = useId();
  const { timeZone } = useMe().organization;
  // The check is the worker's, and may start and end between two of the page's own refreshes: after a press the page
  // asks every 2 seconds, up to ten times, until the last check is a new one.
  const [pressed, setPressed] = useState<{ checkedAt: string | null } | null>(null);
  const polling = pressed !== null && pressed.checkedAt === lastCheckedAt;
  // Once the check runs, the page's own query asks every 2 seconds: this waits only for it to start.
  const waiting = polling && !checkRunning;
  useEffect(() => {
    if (!waiting) return;
    let asked = 0;
    const timer = setInterval(() => {
      asked += 1;
      if (asked > 10) setPressed(null);
      else void refresh();
    }, 2000);
    return () => {
      clearInterval(timer);
    };
  }, [waiting, refresh]);
  const checking = pending || checkRunning;
  const checkedAt = pressed !== null && !polling && !checking ? lastCheckedAt : null;
  const status = checking
    ? checkingWord
    : checkedAt === null
      ? ""
      : checkedAtWord(lastCheckedText(new Date(checkedAt), { timeZone }));
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="outline"
        disabled={checking || !write.allowed || !canCheck}
        aria-describedby={write.hint ? hintId : undefined}
        onClick={() => {
          void check().then(
            async () => {
              setPressed({ checkedAt: lastCheckedAt });
              await refresh();
            },
            () => undefined,
          );
        }}
      >
        {checking && <Spinner />}
        {checking ? checkingWord : action}
      </Button>
      <WriteHint id={hintId} hint={write.hint} visible />
      <p role="status" className="sr-only">
        {status}
      </p>
      <RefusalAlert error={error} />
    </div>
  );
}
