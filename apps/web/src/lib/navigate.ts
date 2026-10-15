// Full page loads, which also drop everything the old page held in memory. Kept in one place so tests can stand in
// for the browser: jsdom can't navigate.

/** Opens path as a new page, kept in the history. */
export function loadPage(path: string): void {
  window.location.assign(path);
}

/** Opens path as a new page in place of this one, so Back doesn't return here. */
export function replacePage(path: string): void {
  window.location.replace(path);
}
