// The link an agency pastes (S3): only a Google Sheets address, from which the spreadsheet's id and the optional tab's
// gid are taken. The URL is never fetched and nothing else of it is kept: the id alone goes to Google, as one encoded
// path segment.
import { z } from "zod";

/** A refusal's message is this code; errors.json holds its sentence. */
export const SHEET_LINK_INVALID = "SHEET_LINK_INVALID";

export interface ParsedSheetLink {
  /** Letters, digits, "-" and "_", 20 to 80 of them. */
  spreadsheetId: string;
  /** The tab the link names (`#gid=` or `?gid=`), or null. */
  gid: string | null;
}

const idPattern = /^\/spreadsheets\/(?:u\/\d{1,2}\/)?d\/([A-Za-z0-9_-]{20,80})(?:\/|$)/;
const gidPattern = /^\d{1,12}$/;

/** The id and tab of a Google Sheets address, or null for anything else. */
export function parseSheetLink(text: string): ParsedSheetLink | null {
  const url = URL.parse(text.trim());
  if (url?.protocol !== "https:" || url.hostname !== "docs.google.com") return null;
  if (url.username !== "" || url.password !== "" || url.port !== "") return null;
  const id = idPattern.exec(url.pathname)?.[1];
  if (id === undefined) return null;
  const fromHash = new URLSearchParams(url.hash.replace(/^#/, "")).get("gid");
  const gid = fromHash ?? url.searchParams.get("gid");
  return { spreadsheetId: id, gid: gid !== null && gidPattern.test(gid) ? gid : null };
}

/** A pasted link, parsed: `{ spreadsheetId, gid }`. */
export const sheetLink = z
  .string()
  .max(2000, SHEET_LINK_INVALID)
  .transform((text, context): ParsedSheetLink => {
    const parsed = parseSheetLink(text);
    if (parsed === null) {
      context.addIssue({ code: "custom", message: SHEET_LINK_INVALID });
      return z.NEVER;
    }
    return parsed;
  });
