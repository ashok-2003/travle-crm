// Waiting for work done in the background (the worker, pg-boss), within a bound the test's own timeout leaves room for.

/**
 * Asks every 200 ms until the answer passes, for up to timeoutMs (default 10 s), then throws "Timed out waiting for
 * <what>". Keep the sum of a test's waits under its timeout, so this message is the one a slow run shows.
 */
export async function eventually<T>(
  ask: () => Promise<T> | T,
  passes: (answer: T) => boolean,
  what: string,
  timeoutMs = 10_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const answer = await ask();
    if (passes(answer)) return answer;
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
