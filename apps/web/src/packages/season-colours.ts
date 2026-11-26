// A season's colour on a group trip's price table and departures calendar: the brand's decorative tints (the ones a
// chat's picture wears), in a fixed order, so the first season (usually the regular prices) is always sage and the next
// amber, sky, rose, violet and sand, repeating after six. Each has its fill for a day or a column and its dark ink for
// the words on it (DESIGN.md: tint surfaces carry dark ink), and `active` the same on a tab that is selected, where the
// registry's own selected look would otherwise win. Written out in full so Tailwind finds every class.
const tints = [
  {
    fill: "bg-(--brand-avatar-sage-fill)",
    ink: "text-(--brand-avatar-sage-ink)",
    active: "data-active:bg-(--brand-avatar-sage-fill) data-active:text-(--brand-avatar-sage-ink)",
  },
  {
    fill: "bg-(--brand-avatar-amber-fill)",
    ink: "text-(--brand-avatar-amber-ink)",
    active: "data-active:bg-(--brand-avatar-amber-fill) data-active:text-(--brand-avatar-amber-ink)",
  },
  {
    fill: "bg-(--brand-avatar-sky-fill)",
    ink: "text-(--brand-avatar-sky-ink)",
    active: "data-active:bg-(--brand-avatar-sky-fill) data-active:text-(--brand-avatar-sky-ink)",
  },
  {
    fill: "bg-(--brand-avatar-rose-fill)",
    ink: "text-(--brand-avatar-rose-ink)",
    active: "data-active:bg-(--brand-avatar-rose-fill) data-active:text-(--brand-avatar-rose-ink)",
  },
  {
    fill: "bg-(--brand-avatar-violet-fill)",
    ink: "text-(--brand-avatar-violet-ink)",
    active: "data-active:bg-(--brand-avatar-violet-fill) data-active:text-(--brand-avatar-violet-ink)",
  },
  {
    fill: "bg-(--brand-avatar-sand-fill)",
    ink: "text-(--brand-avatar-sand-ink)",
    active: "data-active:bg-(--brand-avatar-sand-fill) data-active:text-(--brand-avatar-sand-ink)",
  },
] as const;

export type SeasonTint = (typeof tints)[number];

/** The tint of the season column at this index (the order `seasonColumns` gives). */
export function seasonTint(index: number): SeasonTint {
  return tints[((index % tints.length) + tints.length) % tints.length] ?? tints[0];
}
