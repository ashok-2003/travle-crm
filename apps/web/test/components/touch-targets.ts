// What size a Tailwind class list gives an element. jsdom has no layout, so the touch-target gate reads the size
// utilities themselves: h-11 is 44px, and an `after:-inset-3` pseudo-element widens the hit area by 12px a side.
// Only classes with no variant prefix count, so a `data-[size=sm]:h-7` can't be mistaken for the element's size.

const pixelsPerStep = 4;

function pixels(value: string): number {
  const arbitrary = /^\[(\d+(?:\.\d+)?)px\]$/.exec(value);
  return arbitrary ? Number(arbitrary[1]) : Number(value) * pixelsPerStep;
}

function largest(classes: string[], pattern: RegExp): number {
  return Math.max(0, ...classes.map((name) => pattern.exec(name)?.[1]).map((value) => (value ? pixels(value) : 0)));
}

/** The element's own size plus what its hit-area pseudo-element adds on each side, as [width, height] in px. */
export function targetSize(element: Element): { width: number; height: number } {
  const classes = (element.getAttribute("class") ?? "").split(/\s+/);
  const square = largest(classes, /^size-(\d+|\[[\d.]+px\])$/);
  const height = Math.max(square, largest(classes, /^(?:min-)?h-(\d+|\[[\d.]+px\])$/));
  const width = Math.max(square, largest(classes, /^(?:min-)?w-(\d+|\[[\d.]+px\])$/));
  const reach = (axis: string) => {
    const each =
      largest(classes, new RegExp(`^after:-inset-${axis}(\\d+(?:\\.\\d+)?)$`)) ||
      largest(classes, /^after:-inset-(\d+(?:\.\d+)?)$/);
    return 2 * each;
  };
  return { width: width + reach("x-"), height: height + reach("y-") };
}
