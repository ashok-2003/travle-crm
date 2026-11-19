"use client";

// A card of Home's day (spec 5): its title, and View all in the corner when there is more to open. Each of the four
// day cards wears a subtle tint of its own (owner, 2026-11-19), from the brand's decorative tints, which say no status:
// your tasks sky, needs your attention amber, departures sage, AI insights violet.
import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";
import { ForwardLink } from "@/components/text-link";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** A row of Home's lists (spec 5), one compact line from tablets up: name, then what to do in muted text, at most two
 * lines on a phone. At least 44px. */
export const rowClasses = {
  // The group's own gap and the separator's margin added up to 36px around every line; rows touch their hairline.
  group: "gap-0 has-data-[size=sm]:gap-0",
  separator: "my-0",
  item: "py-1.5",
  content: "min-w-0 gap-0 md:flex-row md:items-center md:gap-3",
  about: "min-w-0 line-clamp-2 break-words md:line-clamp-1",
};

/**
 * A tint: its fill mixed into the card in oklab (no hue drift), each at the share that gives the four the same faint
 * colour (amber is the strongest fill, so the least of it); the card's edge, its rows' hairlines and its muted text take
 * the tint's ink, and its title the ink itself (DESIGN.md: tint surfaces carry dark ink). Written out in full so Tailwind
 * finds every class.
 */
const tints = {
  sky: "bg-[color-mix(in_oklab,var(--brand-avatar-sky-fill)_50%,var(--card))] [--color-border:color-mix(in_oklab,var(--brand-avatar-sky-ink)_12%,var(--card))] [--color-muted-foreground:color-mix(in_oklab,var(--brand-avatar-sky-ink)_30%,var(--muted-foreground))] [&_[data-slot=card-title]]:text-(--brand-avatar-sky-ink)",
  amber:
    "bg-[color-mix(in_oklab,var(--brand-avatar-amber-fill)_30%,var(--card))] [--color-border:color-mix(in_oklab,var(--brand-avatar-amber-ink)_12%,var(--card))] [--color-muted-foreground:color-mix(in_oklab,var(--brand-avatar-amber-ink)_30%,var(--muted-foreground))] [&_[data-slot=card-title]]:text-(--brand-avatar-amber-ink)",
  sage: "bg-[color-mix(in_oklab,var(--brand-avatar-sage-fill)_35%,var(--card))] [--color-border:color-mix(in_oklab,var(--brand-avatar-sage-ink)_12%,var(--card))] [--color-muted-foreground:color-mix(in_oklab,var(--brand-avatar-sage-ink)_30%,var(--muted-foreground))] [&_[data-slot=card-title]]:text-(--brand-avatar-sage-ink)",
  violet:
    "bg-[color-mix(in_oklab,var(--brand-avatar-violet-fill)_45%,var(--card))] [--color-border:color-mix(in_oklab,var(--brand-avatar-violet-ink)_12%,var(--card))] [--color-muted-foreground:color-mix(in_oklab,var(--brand-avatar-violet-ink)_30%,var(--muted-foreground))] [&_[data-slot=card-title]]:text-(--brand-avatar-violet-ink)",
} as const;

export function HomeCard({
  title,
  viewAll,
  tint,
  children,
}: {
  title: string;
  viewAll?: string;
  tint?: keyof typeof tints;
  children: ReactNode;
}) {
  const t = useTranslations("home");
  const headingId = useId();
  return (
    <Card role="region" aria-labelledby={headingId} className={tint === undefined ? undefined : tints[tint]}>
      <CardHeader>
        <CardTitle>
          <h2 id={headingId}>{title}</h2>
        </CardTitle>
        {viewAll !== undefined && (
          <CardAction>
            <ForwardLink href={viewAll} label={t("viewAll")} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  );
}
