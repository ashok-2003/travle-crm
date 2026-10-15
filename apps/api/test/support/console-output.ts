// What a test's code writes to the console, stdout or stderr, captured and kept off the screen until the test ends.
import { onTestFinished, vi } from "vitest";

/** Starts capturing; the function it returns gives everything written so far, one entry per call. */
export function consoleOutput(): () => string[] {
  const written: string[] = [];
  const keep = (...parts: unknown[]) => {
    written.push(parts.map((part) => (part instanceof Error ? String(part.stack) : String(part))).join(" "));
  };
  const spies = [
    ...(["error", "warn", "log", "info", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(keep),
    ),
    ...[process.stderr, process.stdout].map((stream) =>
      vi.spyOn(stream, "write").mockImplementation((chunk: unknown) => {
        keep(chunk);
        return true;
      }),
    ),
  ];
  onTestFinished(() => {
    for (const spy of spies) spy.mockRestore();
  });
  return () => written;
}
