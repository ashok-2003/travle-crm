// What size a Tailwind class list gives an element. jsdom has no layout, so the touch-target gate reads the size
// utilities themselves, the way the browser ends up applying them:
// - h-11 is 44px. Of the classes that set one property, the last one wins: cn (tailwind-merge) drops the earlier
//   ones, and keeps `size-11 h-8` together because the later h-8 overrides size-11's height. min-h-* is a property of
//   its own, so the larger of it and the height counts.
// - An `after:-inset-3` pseudo-element widens the hit area by 12px a side, but only when it is `after:absolute` on a
//   positioned element; otherwise it isn't over the element at all.
// Only classes with no variant prefix count as the element's size, so a `data-[size=sm]:h-7` can't be mistaken for it.

const pixelsPerStep = 4;
const length = String.raw`(\d+(?:\.\d+)?|\[\d+(?:\.\d+)?px\])`;

function pixels(value: string): number {
  const arbitrary = /^\[(\d+(?:\.\d+)?)px\]$/.exec(value);
  return arbitrary ? Number(arbitrary[1]) : Number(value) * pixelsPerStep;
}

/** The last class matching pattern, the one that wins, with its captures. */
function last(classes: string[], pattern: RegExp): RegExpExecArray | null {
  for (let index = classes.length - 1; index >= 0; index -= 1) {
    const match = pattern.exec(classes[index] ?? "");
    if (match) return match;
  }
  return null;
}

/** Height ("h") or width ("w"): the winning size-* or h-* (w-*), or min-h-* (min-w-*) if that is larger. */
function dimension(classes: string[], axis: "h" | "w"): number {
  const set = last(classes, new RegExp(`^(?:size|${axis})-${length}$`))?.[1];
  const minimum = last(classes, new RegExp(`^min-${axis}-${length}$`))?.[1];
  return Math.max(set ? pixels(set) : 0, minimum ? pixels(minimum) : 0);
}

const positions = /^(static|relative|absolute|fixed|sticky)$/;
const pseudoPositions = /^after:(static|relative|absolute|fixed|sticky)$/;

/** How far the hit-area pseudo-element reaches past the element on one side of an axis, in px. */
function reach(classes: string[], axis: "x" | "y"): number {
  const positioned = (last(classes, positions)?.[1] ?? "static") !== "static";
  if (!positioned || last(classes, pseudoPositions)?.[1] !== "absolute") return 0;
  // after:-inset-y-2.5 or after:-inset-3, whichever comes last; a positive inset reaches inwards, adding nothing.
  const inset = last(classes, new RegExp(`^after:(-?)inset-(?:${axis}-)?(\\d+(?:\\.\\d+)?)$`));
  return inset?.[1] === "-" ? pixels(inset[2] ?? "0") : 0;
}

/** The element's own size plus what its hit-area pseudo-element adds on each side, as [width, height] in px. */
export function targetSize(element: Element): { width: number; height: number } {
  const classes = (element.getAttribute("class") ?? "").split(/\s+/);
  return {
    width: dimension(classes, "w") + 2 * reach(classes, "x"),
    height: dimension(classes, "h") + 2 * reach(classes, "y"),
  };
}
