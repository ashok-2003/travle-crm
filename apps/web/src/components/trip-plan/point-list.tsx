// Stored free text as points, one a line: included ones ticked in green, excluded ones crossed, the rest bulleted. Shared
// by the opened quote and the trip page (and later the public package page); it has no words of its own.
import { CheckIcon, XIcon } from "lucide-react";

type Tone = "included" | "excluded" | "plain";

/** The lines of stored text that say something, without a typed bullet mark. */
export const pointsOf = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-•*]\s+/, "").trim())
    .filter((line) => line !== "");

export function PointList({ text, tone }: { text: string; tone: Tone }) {
  const points = pointsOf(text);
  if (points.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {points.map((point, index) => (
        <li key={`${String(index)}-${point}`} className="flex items-start gap-2">
          {tone === "included" && (
            <CheckIcon data-mark="tick" aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-status-good-ink" />
          )}
          {tone === "excluded" && (
            <XIcon data-mark="cross" aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          )}
          {tone === "plain" && (
            <span
              data-mark="bullet"
              aria-hidden="true"
              className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground/60"
            />
          )}
          <span className="wrap-anywhere">{point}</span>
        </li>
      ))}
    </ul>
  );
}
