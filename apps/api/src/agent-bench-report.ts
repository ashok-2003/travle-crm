// The agent bench's report: a Markdown account of every case and turn, with the customer's words and the replies. It is the
// one place those words are kept, so it is written outside the repository, readable by its owner alone.
import { chmodSync, existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { LiteCaseResult } from "@travel-crm/domain/ai";

/** Whether the file would sit under the repository's folder, following links on the part of the path that exists. */
export function insideRepository(file: string, repositoryRoot: string): boolean {
  const real = (path: string): string => {
    const target = resolve(path);
    if (existsSync(target)) return realpathSync.native(target);
    const parent = dirname(target);
    return parent === target ? target : resolve(real(parent), relative(parent, target));
  };
  const inside = relative(real(repositoryRoot), real(file));
  const leavesRoot = inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside);
  return !leavesRoot;
}

/** Writes the report in a folder only its owner can enter, as a file only its owner can read. */
export function writePrivateReport(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  // A file that already exists keeps its old mode when written over, so it goes first.
  rmSync(file, { force: true });
  writeFileSync(file, text, { mode: 0o600 });
  chmodSync(file, 0o600);
}

const quoted = (lines: readonly string[]) => lines.map((one) => `> ${one === "" ? "(no words)" : one}`).join("\n");

export function benchReport(
  results: readonly LiteCaseResult[],
  meta: { at: Date; fake: boolean; casesFolder: string },
): string {
  const turns = results.flatMap((one) => one.turns);
  const models = [...new Set(turns.flatMap((turn) => (turn.model === null ? [] : [turn.model])))];
  const passed = results.filter((one) => one.checks.every((check) => check.pass)).length;
  const tokens = turns.reduce((sum, turn) => sum + turn.inputTokens + turn.outputTokens, 0);
  const out: string[] = [
    `# Agent bench, ${meta.at.toISOString()}`,
    "",
    `- Model: ${meta.fake ? "scripted answers (--fake)" : models.join(", ") || "none seen"}`,
    `- Cases passed: ${String(passed)} of ${String(results.length)}`,
    `- Tokens: ${String(tokens)}`,
    `- Cases from: ${meta.casesFolder}`,
    "",
  ];
  for (const one of results) {
    const ok = one.checks.every((check) => check.pass);
    out.push(`## ${one.name}: ${ok ? "pass" : "FAIL"}`, "");
    for (const check of one.checks) out.push(`- ${check.pass ? "pass" : "FAIL"}  ${check.name}`);
    for (const [index, turn] of one.turns.entries()) {
      out.push(
        "",
        `### Turn ${String(index + 1)}`,
        "",
        "Customer:",
        quoted(turn.customer),
        "",
        "Reply as sent:",
        quoted(turn.text === null ? [] : [turn.text]) || "> (nothing sent)",
        "",
        `- move: ${turn.move ?? "none"}, outcome: ${turn.outcome}, reason: ${turn.reason ?? "none"}`,
        `- why: ${turn.why ?? "none"}`,
        `- intents: ${turn.intents.join(", ") || "none"}, asked: ${turn.asked ?? "none"}`,
        `- model: ${turn.model ?? "none"}, tokens: ${String(turn.inputTokens)} in, ${String(turn.outputTokens)} out`,
      );
    }
    out.push("");
  }
  return `${out.join("\n")}\n`;
}
