// Starts a download from a short-lived storage link. The link saves the file under its own name (Content-Disposition:
// attachment, ADR 0011), so the browser downloads it and this page stays open. In its own file so tests can stand in
// for the browser: jsdom can't navigate.
export function startDownload(url: string): void {
  window.location.assign(url);
}
