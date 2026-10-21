// After a button's action takes its own alert or row away, the focus is left on nothing (the page's body). This moves it
// to the screen's h1, which a screen reader then reads and a keyboard starts from.
export function focusPageHeading(): void {
  const heading = document.querySelector("h1");
  if (heading === null) return;
  heading.setAttribute("tabindex", "-1");
  heading.focus({ preventScroll: true });
}
