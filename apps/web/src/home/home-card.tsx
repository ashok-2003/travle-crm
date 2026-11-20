"use client";

// A card of Home's day (spec 5): its title, and View all in the corner when there is more to open. Each of the four
// day cards wears a subtle tint of the colour that says what it holds (owner, 2026-11-19).
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
 * A card's tint says what it holds (owner, 2026-11-19): your tasks the primary blue, what needs you the attention
 * amber, departures the good green, the AI its violet. Each is the colour's own tint mixed into the card in oklab (no
 * hue drift), at the share that makes the four equally faint (amber is the strongest, so the least of it); the card's
 * edge, its rows' hairlines and its muted text take the colour's dark ink, and its title the ink itself (DESIGN.md: tint
 * surfaces carry dark ink). Written out in full so Tailwind finds every class.
 */
const tints = {
  primary:
    "bg-[color-mix(in_oklab,var(--brand-action-tint)_80%,var(--card))] [--color-border:color-mix(in_oklab,var(--brand-action-pressed)_10%,var(--card))] [--color-muted-foreground:color-mix(in_oklab,var(--brand-action-pressed)_30%,var(--muted-foreground))] [&_[data-slot=card-title]]:text-(--brand-action-pressed)",
  attention:
    "bg-[color-mix(in_oklab,var(--brand-status-attention-fill)_30%,var(--card))] [--color-border:color-mix(in_oklab,var(--brand-status-attention-ink)_12%,var(--card))] [--color-muted-foreground:color-mix(in_oklab,var(--brand-status-attention-ink)_30%,var(--muted-foreground))] [&_[data-slot=card-title]]:text-(--brand-status-attention-ink)",
  good: "bg-[color-mix(in_oklab,var(--brand-status-good-fill)_50%,var(--card))] [--color-border:color-mix(in_oklab,var(--brand-status-good-ink)_12%,var(--card))] [--color-muted-foreground:color-mix(in_oklab,var(--brand-status-good-ink)_30%,var(--muted-foreground))] [&_[data-slot=card-title]]:text-(--brand-status-good-ink)",
  ai: "bg-[color-mix(in_oklab,var(--brand-people-tint)_50%,var(--card))] [--color-border:color-mix(in_oklab,var(--brand-people-tint-ink)_12%,var(--card))] [--color-muted-foreground:color-mix(in_oklab,var(--brand-people-tint-ink)_30%,var(--muted-foreground))] [&_[data-slot=card-title]]:text-(--brand-people-tint-ink)",
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
