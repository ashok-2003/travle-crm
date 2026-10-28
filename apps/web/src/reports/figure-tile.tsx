"use client";

// One figure of a report (reports): its name, its value large, and how it moved against the period before (up in the
// good tone, down in the bad, or the other way for a figure where less is better, like the wait for a reply).
import { ArrowDownRightIcon, ArrowUpRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { InfoHint } from "@/components/info-hint";
import { cn } from "@/lib/utils";

export function FigureTile({
  label,
  value,
  now,
  before,
  lessIsBetter = false,
  hint,
  note,
}: {
  label: string;
  value: ReactNode;
  /** The figure and the period before's, to show the change; leave out for none. */
  now?: number | null;
  before?: number | null;
  lessIsBetter?: boolean;
  hint?: string | undefined;
  note?: string | undefined;
}) {
  const t = useTranslations("reports.figures");
  const change =
    now === undefined || before === undefined || now === null || before === null || before === 0
      ? null
      : Math.round(((now - before) * 100) / before);
  const good = change === null ? null : lessIsBetter ? change <= 0 : change >= 0;
  return (
    <div className="flex flex-col gap-1">
      <dt className="inline-flex items-center gap-1 text-label text-muted-foreground">
        {label}
        {hint !== undefined && <InfoHint term={label}>{hint}</InfoHint>}
      </dt>
      <dd className="numbers text-section font-semibold">{value}</dd>
      <dd className="flex flex-wrap items-center gap-1 text-caption text-muted-foreground">
        {change !== null && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium",
              good === true ? "text-status-good-ink" : "text-status-bad-ink",
            )}
          >
            {change >= 0 ? (
              <ArrowUpRightIcon aria-hidden="true" className="size-3.5" />
            ) : (
              <ArrowDownRightIcon aria-hidden="true" className="size-3.5" />
            )}
            {t("change", { change: Math.abs(change), direction: change >= 0 ? "up" : "down" })}
          </span>
        )}
        {note !== undefined && <span>{note}</span>}
      </dd>
    </div>
  );
}
