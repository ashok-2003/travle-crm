// Reports an error nobody can act on in the moment (a failed wipe just before another page loads) the way an
// uncaught error is reported: in the console and to window's "error" listeners, where an error monitor can hear it.
// It never throws, so it can't become an unhandled rejection itself.

/** Browsers the app supports all have reportError; jsdom doesn't, so tests stand one in. */
const browser = globalThis as { reportError?: (error: unknown) => void };

export function reportProblem(error: unknown): void {
  browser.reportError?.(error);
}
