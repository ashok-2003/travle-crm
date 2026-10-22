// Reads the log messages Better Auth itself can write, from the installed package's code: every string literal passed to
// a `logger.error`, `.warn`, `.info` or `.debug` call. A literal that is the whole message is a static sentence; one that
// is a template or is joined to more text with `+` is a prefix, the part before the first value goes in. The checked-in
// list (src/identity/auth/better-auth-messages.ts) must equal this; a new Better Auth version that adds or rewords a
// message fails the test until the list is regenerated (UPDATE_AUTH_MESSAGES=1 pnpm --filter @travel-crm/domain test).
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

const CALL = /logger\??\.(?:error|warn|info|debug)\(\s*("(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`)(\s*\+)?/g;

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const file = path.join(directory, name);
    if (statSync(file).isDirectory()) return filesUnder(file);
    return file.endsWith(".mjs") ? [file] : [];
  });
}

/** The text of a string literal as JavaScript reads it, up to the first `${` of a template. */
function textOf(literal: string): { text: string; whole: boolean } {
  if (literal.startsWith('"')) return { text: JSON.parse(literal) as string, whole: true };
  const body = literal.slice(1, -1);
  const interpolation = body.indexOf("${");
  const raw = interpolation === -1 ? body : body.slice(0, interpolation);
  const text = raw.replace(/\\(.)/gs, (_escape, character: string) => (character === "n" ? "\n" : character));
  return { text, whole: interpolation === -1 };
}

export interface BetterAuthMessages {
  statics: string[];
  prefixes: string[];
}

export function extractBetterAuthMessages(): BetterAuthMessages {
  // The package where pnpm put it, and its dependency beside it in the store.
  const betterAuth = realpathSync(path.resolve(import.meta.dirname, "../../../node_modules/better-auth"));
  const core = realpathSync(path.resolve(betterAuth, "../@better-auth/core"));
  const statics = new Set<string>();
  const prefixes = new Set<string>();
  for (const file of [...filesUnder(path.join(betterAuth, "dist")), ...filesUnder(path.join(core, "dist"))]) {
    for (const match of readFileSync(file, "utf8").matchAll(CALL)) {
      const { text, whole } = textOf(match[1] ?? '""');
      if (text.length < 3) continue;
      if (whole && match[2] === undefined) statics.add(text);
      else prefixes.add(text);
    }
  }
  return { statics: [...statics].sort(), prefixes: [...prefixes].sort() };
}
