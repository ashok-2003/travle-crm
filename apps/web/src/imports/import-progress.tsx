"use client";

// An import's progress bar (spec 3.2 step 4, B26): "642 of 1,157 rows", its numbers in mono, and how long is left once
// five seconds of the add's pace are known ("About a minute left"). The screen asks every 2 seconds, so each answer
// moves it; a screen reader hears the count every ten seconds or so, and at the end (X6).
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { formatCount } from "@/lib/format";
import { useNow } from "@/lib/use-now";

/** The pace isn't worth telling before this much of it is known. */
const PACE_KNOWN_MS = 5000;

/** How often a screen reader hears the count, which moves every 2 seconds: often enough to follow, not to drown in. */
const SAY_EVERY_MS = 10_000;

/** The numbers alone in mono, the words around them in sans (X5). */
const numbers = (chunks: ReactNode) => <span className="numbers">{chunks}</span>;

/**
 * The words a polite live region says: held until SAY_EVERY_MS have passed by the screen's clock since it last spoke,
 * and said at once when they're the last.
 */
function useSaidNow(words: string, last: boolean, now: number): string {
  const [said, setSaid] = useState({ words, at: now });
  if (said.words !== words && (last || now - said.at >= SAY_EVERY_MS)) setSaid({ words, at: now });
  return said.words;
}

/**
 * What's left at the pace so far, in whole minutes, or null while too little is known or nothing is left. The pace is
 * measured from the add's request (addRequestedAt), the one time the import keeps: its first row's time isn't, and
 * the gap is the queue's few seconds (W6).
 */
function minutesLeft(done: number, total: number, since: string | null, now: number): number | null {
  if (since === null || done === 0 || done >= total) return null;
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
  const counts = { done: formatCount(done), total: formatCount(total) };
  const said = useSaidNow(t.markup("rows", { ...counts, n: (chunks) => chunks }), done >= total, now.getTime());
  return (
    <div className="flex flex-col gap-2">
      <Progress value={percent} aria-label={label} />
      <p role="status" className="sr-only">
        {said}
      </p>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span>{t.rich("rows", { ...counts, n: numbers })}</span>
        {minutes !== null && (
          <span className="text-label text-muted-foreground">
            {minutes === 1 ? t("aboutAMinute") : t("aboutMinutes", { minutes: formatCount(minutes) })}
          </span>
        )}
      </div>
    </div>
  );
}
