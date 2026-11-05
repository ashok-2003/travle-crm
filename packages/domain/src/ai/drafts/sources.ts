// An agency's own documents as numbered lines (P1.L3: piece 1, line 3) for package drafting: the AI cites tokens, code turns each
// back into the real line, so the words a reviewer sees beside a value are the agency's own, never the model's copy of them.
import { PACKAGE_DRAFT_CHARACTERS, type SourceRef } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { autopilotOf } from "../autopilot.js";

/** A longer line is cut into numbered parts of this many characters. */
const LINE_CHARACTERS = 400;

export interface SourceLine {
  /** "P2.L3": how the AI names it. */
  token: string;
  text: string;
}

export interface SourcePiece {
  key: string;
  /** What a reviewer sees as the source: "Knowledge: Spiti", "Instructions", "Strict rules", "Trip kit: Kerala". */
  label: string;
  kind: "knowledge" | "instructions" | "strict_rules" | "trip_kit";
  knowledgeId: string | null;
  hasFile: boolean;
  lines: SourceLine[];
}

interface RawPiece {
  key: string;
  label: string;
  kind: SourcePiece["kind"];
  knowledgeId: string | null;
  hasFile: boolean;
  texts: string[];
}

/** Lines of a text: split on newlines, blank ones dropped, a long one cut into parts. */
function linesOf(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .flatMap((line) => {
      const cuts: string[] = [];
      for (let start = 0; start < line.length; start += LINE_CHARACTERS)
        cuts.push(line.slice(start, start + LINE_CHARACTERS));
      return cuts;
    });
}

const byText = (first: string, second: string) => (first < second ? -1 : first > second ? 1 : 0);

/** Enabled, ready knowledge, the instructions, the strict rules and the trip kits, empty ones left out, in a stable order. */
export async function packageSources(tx: OrgTx): Promise<SourcePiece[]> {
  const knowledge = await tx.aiKnowledge.findMany({
    where: { enabled: true, status: "ready" },
    select: { id: true, title: true, body: true, kind: true, attachmentId: true },
  });
  const settings = await tx.aiSettings.findFirst({ select: { instructions: true } });
  const autopilot = await autopilotOf(tx);
  const kits = await tx.tripKit.findMany({ select: { id: true, name: true, message: true, keywords: true } });
  const raws: RawPiece[] = [
    ...[...knowledge]
      .sort((first, second) => byText(first.title, second.title) || byText(first.id, second.id))
      .map((row) => ({
        key: `knowledge:${row.id}`,
        label: `Knowledge: ${row.title}`,
        kind: "knowledge" as const,
        knowledgeId: row.id,
        hasFile: row.kind === "file" || row.attachmentId !== null,
        texts: linesOf(row.body),
      })),
    {
      key: "instructions",
      label: "Instructions",
      kind: "instructions",
      knowledgeId: null,
      hasFile: false,
      texts: linesOf(settings?.instructions ?? ""),
    },
    {
      key: "strict_rules",
      label: "Strict rules",
      kind: "strict_rules",
      knowledgeId: null,
      hasFile: false,
      texts: linesOf(autopilot.strictRules),
    },
    ...[...kits]
      .sort((first, second) => byText(first.name, second.name) || byText(first.id, second.id))
      .map((kit) => ({
        key: `trip_kit:${kit.id}`,
        label: `Trip kit: ${kit.name}`,
        kind: "trip_kit" as const,
        knowledgeId: null,
        hasFile: false,
        texts: [...linesOf(kit.message), ...(kit.keywords.length > 0 ? [`Keywords: ${kit.keywords.join(", ")}`] : [])],
      })),
  ];
  return raws
    .filter((raw) => raw.texts.length > 0)
    .map((raw, pieceIndex) => ({
      key: raw.key,
      label: raw.label,
      kind: raw.kind,
      knowledgeId: raw.knowledgeId,
      hasFile: raw.hasFile,
      lines: raw.texts.map((text, lineIndex) => ({
        token: `P${String(pieceIndex + 1)}.L${String(lineIndex + 1)}`,
        text,
      })),
    }));
}

const sizeOf = (lines: readonly SourceLine[]) => lines.reduce((sum, line) => sum + line.text.length, 0);

/** Whole pieces packed into parts under the budget; one piece over it becomes parts of its own, cut by lines. */
export function partsOf(
  pieces: SourcePiece[],
  budget = PACKAGE_DRAFT_CHARACTERS,
): { ref: string; label: string; pieces: SourcePiece[] }[] {
  const groups: SourcePiece[][] = [];
  let current: SourcePiece[] = [];
  let size = 0;
  const flush = () => {
    if (current.length > 0) groups.push(current);
    current = [];
    size = 0;
  };
  for (const piece of pieces) {
    const pieceSize = sizeOf(piece.lines);
    if (pieceSize > budget) {
      flush();
      let lines: SourceLine[] = [];
      let linesSize = 0;
      for (const line of piece.lines) {
        if (lines.length > 0 && linesSize + line.text.length > budget) {
          groups.push([{ ...piece, lines }]);
          lines = [];
          linesSize = 0;
        }
        lines.push(line);
        linesSize += line.text.length;
      }
      if (lines.length > 0) groups.push([{ ...piece, lines }]);
      continue;
    }
    if (size + pieceSize > budget) flush();
    current.push(piece);
    size += pieceSize;
  }
  flush();
  return groups.map((group, index) => ({
    ref: `part-${String(index + 1)}`,
    label: [...new Set(group.map((piece) => piece.label))].join(", "),
    pieces: group,
  }));
}

/** "[P1.L3] text" per line, under the piece's label as a heading. */
export function linesAsText(pieces: readonly SourcePiece[]): string {
  return pieces
    .map((piece) => [piece.label, ...piece.lines.map((line) => `[${line.token}] ${line.text}`)].join("\n"))
    .join("\n\n");
}

/** Each token that exists as its real line, in the order given; unknown tokens and repeats are dropped. */
export function resolveTokens(tokens: readonly string[], pieces: readonly SourcePiece[]): SourceRef[] {
  const found = new Map<string, SourceRef>();
  for (const piece of pieces) {
    for (const line of piece.lines)
      found.set(line.token, { token: line.token, source: piece.label, excerpt: line.text });
  }
  const seen = new Set<string>();
  return tokens.flatMap((token) => {
    const ref = found.get(token);
    if (ref === undefined || seen.has(token)) return [];
    seen.add(token);
    return [ref];
  });
}
