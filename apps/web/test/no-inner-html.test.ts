// The Content-Security-Policy allows inline scripts (security-headers.ts; ADR 0018 records why), so the only guard
// against injected script is that the app never renders HTML from a string: React escapes everything else. This
// tripwire fails if any of the ways to do that appears in the app's source, generated files included. The one HTML the
// app shows as it is, a failed email as it was sent (the console), goes in an iframe's srcDoc sandboxed with no
// permissions at all: an opaque origin where no script runs, no form posts and nothing navigates. React 19 also writes
// a `<script>` element's text children unescaped, so `<script` is flagged too; the one allowed is the install bar's
// early listener (pwa/install-prompt-capture.tsx), whose text must be its exported constant and nothing else.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sourceDirectory = path.resolve(import.meta.dirname, "../src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|js|mjs)$/.test(entry.name) ? [full] : [];
  });
}

/** React's escape hatch, and the DOM's own ways to parse a string as HTML. */
const htmlFromString = /dangerouslySetInnerHTML|\.(innerHTML|outerHTML)\b|insertAdjacentHTML|document\.write/;

/** A `<script` element in JSX: not one inside a string or template (the snippet an agency pastes) or a regex. */
const JSX_SCRIPT = /(^|[^"'`/\w])<script\b/im;

describe("HTML from strings", () => {
  it("is shown only in a frame sandboxed with no permissions", () => {
    const framed = sourceFiles(sourceDirectory).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return /\bsrcDoc\b/i.test(source) ? [{ file: path.relative(sourceDirectory, file), source }] : [];
    });
    expect(framed.map(({ file }) => file)).toEqual(["console/emails/email-as-sent.tsx"]);
    for (const { file, source } of framed) {
      const frames = source.match(/<iframe\b[^>]*>/g) ?? [];
      expect(frames, file).toHaveLength(1);
      expect(frames[0], file).toMatch(/\ssandbox=""\s/);
      expect(source, file).not.toMatch(/allow-(scripts|same-origin|forms|popups|top-navigation)/);
    }
  });

  it("has one inline script: the install prompt's early listener, whose text is its own constant", () => {
    const scripts = sourceFiles(sourceDirectory).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return JSX_SCRIPT.test(source) ? [{ file: path.relative(sourceDirectory, file), source }] : [];
    });
    expect(scripts.map(({ file }) => file)).toEqual(["pwa/install-prompt-capture.tsx"]);
    for (const { file, source } of scripts) {
      // Exactly one script tag in any case (<SCRIPT>, <Script>), and that one is the constant's element, written out.
      expect(source.match(/<script\b/gi), file).toHaveLength(1);
      expect(source, file).toContain("<script>{installPromptScript}</script>");
    }
  });

  it("appears nowhere in the app's source", () => {
    const files = sourceFiles(sourceDirectory);
    expect(files.length).toBeGreaterThan(10);
    const offenders = files.flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((line, index) => `${path.relative(sourceDirectory, file)}:${String(index + 1)}: ${line.trim()}`)
        .filter((line) => htmlFromString.test(line)),
    );
    expect(offenders).toEqual([]);
  });
});
