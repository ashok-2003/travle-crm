// Clean context lines: one value on one fenced line, and the chat's summary quoted to its budget.
import { fenced } from "../../fenced.js";

/** The stored summary may be 1,000 characters; the context quotes about this many of them. */
export const SUMMARY_QUOTED = 800;

/** The summary's lines, cut at a line or word boundary when it runs past what the context quotes back. */
export function summaryLines(summary: string): string[] {
  // Model-written from customer words: fenced like them, and no line may open a heading of its own.
  const text = summary
    .split("\n")
    .map((line) => fenced(line.trim()))
    .filter((line) => line !== "" && !line.startsWith("#"))
    .join("\n");
  if (text.length <= SUMMARY_QUOTED) return text === "" ? [] : text.split("\n");
  const head = text.slice(0, SUMMARY_QUOTED);
  const atLine = head.lastIndexOf("\n");
  const atWord = head.lastIndexOf(" ");
  const cut = atLine >= SUMMARY_QUOTED / 2 ? atLine : atWord > 0 ? atWord : SUMMARY_QUOTED;
  return `${head.slice(0, cut).trimEnd()}…`.split("\n");
}

/** A value typed by a person or written from customer words, as one fenced line: a newline could add a line or heading. */
export const oneLine = (text: string): string => fenced(text.replace(/\s+/g, " ").trim());
