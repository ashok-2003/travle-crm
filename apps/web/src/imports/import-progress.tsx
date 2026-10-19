"use client";

// An import's progress bar (spec 3.2 step 4, B26): "642 of 1,157 rows", and how long is left once five seconds of the
// add's pace are known ("About a minute left"). The screen asks every 2 seconds, so each answer moves it.
import { useTranslations } from "next-intl";
import { Progress } from "@/components/ui/progress";
import { formatCount } from "@/lib/format";
import { useNow } from "@/lib/use-now";

/** The pace isn't worth telling before this much of it is known. */
const PACE_KNOWN_MS = 5000;

/** What's left at the pace so far, in whole minutes, or null while too little is known. */
function minutesLeft(done: number, total: number, since: string | null, now: number): number | null {
  if (since === null || done === 0) return null;
  const elapsed = now - Date.parse(since);
  if (elapsed < PACE_KNOWN_MS) return null;
  const leftMs = ((total - done) * elapsed) / done;
  return Math.max(1, Math.round(leftMs / 60_000));
}

export function ImportProgress({
  done,
  total,
  since,
  label,
}: {
  done: number;
  total: number;
  /** When the step began (the add's addRequestedAt), for its pace. */
  since: string | null;
  /** What the bar measures, for screen readers: "Adding leads". */
  label: string;
}) {
  const t = useTranslations("imports.progress");
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  // Each answer moves the bar; the clock moves the time left between them.
  const now = useNow(5000);
  const minutes = minutesLeft(done, total, since, now.getTime());
  return (
    <div className="flex flex-col gap-2">
      <Progress value={percent} aria-label={label} />
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="numbers">{t("rows", { done: formatCount(done), total: formatCount(total) })}</span>
        {minutes !== null && (
          <span className="text-label text-muted-foreground">
            {minutes === 1 ? t("aboutAMinute") : t("aboutMinutes", { minutes: formatCount(minutes) })}
          </span>
        )}
      </div>
    </div>
  );
}
