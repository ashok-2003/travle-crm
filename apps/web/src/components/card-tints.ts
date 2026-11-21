// A card's tint says what it holds (DESIGN.md "Home's Day Cards", owner 2026-11-19; "The Lead Page's Tints", owner
// 2026-11-21): your tasks the primary blue, what needs you the attention amber, departures the good green, the AI its
// violet, a lead's trip a soft sky. Each is the colour's own tint mixed into the card in oklab (no hue drift), at the
// share that makes them equally faint (amber is the strongest, so the least of it); the card's edge, its rows'
// hairlines and its muted text take the colour's dark ink, and its title the ink itself (DESIGN.md: tint surfaces carry
// dark ink). Written out in full so Tailwind finds every class.
export const cardTints = {
  primary:
    "bg-[color-mix(in_oklab,var(--brand-action-tint)_80%,var(--card))] [--color-border:color-mix(in_oklab,var(--brand-action-pressed)_10%,var(--card))] [--color-muted-foreground:color-mix(in_oklab,var(--brand-action-pressed)_30%,var(--muted-foreground))] [&_[data-slot=card-title]]:text-(--brand-action-pressed)",
  attention:
    "bg-[color-mix(in_oklab,var(--brand-status-attention-fill)_30%,var(--card))] [--color-border:color-mix(in_oklab,var(--brand-status-attention-ink)_12%,var(--card))] [--color-muted-foreground:color-mix(in_oklab,var(--brand-status-attention-ink)_30%,var(--muted-foreground))] [&_[data-slot=card-title]]:text-(--brand-status-attention-ink)",
  good: "bg-[color-mix(in_oklab,var(--brand-status-good-fill)_50%,var(--card))] [--color-border:color-mix(in_oklab,var(--brand-status-good-ink)_12%,var(--card))] [--color-muted-foreground:color-mix(in_oklab,var(--brand-status-good-ink)_30%,var(--muted-foreground))] [&_[data-slot=card-title]]:text-(--brand-status-good-ink)",
  ai: "bg-[color-mix(in_oklab,var(--brand-people-tint)_50%,var(--card))] [--color-border:color-mix(in_oklab,var(--brand-people-tint-ink)_12%,var(--card))] [--color-muted-foreground:color-mix(in_oklab,var(--brand-people-tint-ink)_30%,var(--muted-foreground))] [&_[data-slot=card-title]]:text-(--brand-people-tint-ink)",
  sky: "bg-[color-mix(in_oklab,var(--brand-avatar-sky-fill)_45%,var(--card))] [--color-border:color-mix(in_oklab,var(--brand-avatar-sky-ink)_12%,var(--card))] [--color-muted-foreground:color-mix(in_oklab,var(--brand-avatar-sky-ink)_30%,var(--muted-foreground))] [&_[data-slot=card-title]]:text-(--brand-avatar-sky-ink)",
} as const;

export type CardTint = keyof typeof cardTints;
