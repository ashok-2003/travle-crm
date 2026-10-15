// Moving focus to a step or an outcome as it appears, so keyboard and screen-reader users carry on from there instead
// of from the top of the page, or from a button that has just gone.

/** A ref callback that focuses the element once, when it appears. Elements that aren't controls need tabIndex={-1}. */
export function focusWhenShown(element: HTMLElement | null): void {
  element?.focus();
}
