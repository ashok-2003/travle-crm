// What Google answers, read defensively: the two endpoints' bodies as typed values, and its errors as our reasons (S5).
import { GoogleSheetsError } from "./google-sheets.js";

export interface SpreadsheetMetadata {
  title: string;
  locale: string;
  timeZone: string;
  tabs: { gid: string; title: string; isGrid: boolean; rowCount: number }[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const text = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);

function unreadable(): never {
  throw new GoogleSheetsError("unavailable");
}

/** The answer of spreadsheets.get, asked for only the fields describe needs. A body of another shape is unavailable. */
export function parseMetadata(body: unknown): SpreadsheetMetadata {
  if (!isRecord(body) || !isRecord(body.properties) || !Array.isArray(body.sheets)) return unreadable();
  const tabs = body.sheets.map((sheet: unknown) => {
    const properties = isRecord(sheet) ? sheet.properties : undefined;
    if (!isRecord(properties) || typeof properties.sheetId !== "number") return unreadable();
    const grid = isRecord(properties.gridProperties) ? properties.gridProperties : {};
    return {
      gid: String(properties.sheetId),
      title: text(properties.title),
      isGrid: properties.sheetType === undefined || properties.sheetType === "GRID",
      rowCount: typeof grid.rowCount === "number" ? grid.rowCount : 0,
    };
  });
  return {
    title: text(body.properties.title),
    locale: text(body.properties.locale, "en_US"),
    timeZone: text(body.properties.timeZone, "UTC"),
    tabs,
  };
}

/** The answer of values.batchGet: one array of rows (arrays of cells) for each range asked, [] when a range is empty. */
export function parseValueRanges(body: unknown): unknown[][][] {
  if (!isRecord(body) || !Array.isArray(body.valueRanges)) return unreadable();
  return body.valueRanges.map((range: unknown) => {
    const values = isRecord(range) ? range.values : undefined;
    if (values === undefined) return [];
    if (!Array.isArray(values)) return unreadable();
    return values.map((row: unknown) => (Array.isArray(row) ? (row as unknown[]) : unreadable()));
  });
}

const quotaReasons = new Set([
  "RATE_LIMIT_EXCEEDED",
  "ratelimitexceeded",
  "userratelimitexceeded",
  "RESOURCE_EXHAUSTED",
]);

// A 403 caused by our own Google project, not by the sheet's sharing: it must never read as "not shared" (SC1).
const projectReasons = new Set([
  "service_disabled",
  "accessnotconfigured",
  "access_token_scope_insufficient",
  "consumer_suspended",
  "user_project_denied",
]);

/** Everything Google says about an error that decides its reason: status text, reasons and message, in lower case. */
function errorWords(body: unknown): { status: string; reasons: string[]; message: string } {
  const error = isRecord(body) && isRecord(body.error) ? body.error : {};
  const reasons: string[] = [];
  for (const list of [error.errors, error.details]) {
    if (Array.isArray(list))
      for (const item of list) if (isRecord(item) && typeof item.reason === "string") reasons.push(item.reason);
  }
  return { status: text(error.status), reasons, message: text(error.message).toLowerCase() };
}

/** Seconds from a Retry-After header, null when absent or not a number (an HTTP date is not used). */
export function retryAfterSecondsOf(header: string | null): number | null {
  if (header === null || !/^\d+$/.test(header.trim())) return null;
  return Number(header.trim());
}

/** S5, S37, S39, S40: a failed answer as one reason. The error holds the reason only, never Google's words. */
export function mapGoogleError(status: number, body: unknown, retryAfter: string | null): GoogleSheetsError {
  const words = errorWords(body);
  const quota = [words.status, ...words.reasons].some(
    (word) => quotaReasons.has(word) || quotaReasons.has(word.toLowerCase()),
  );
  if (status === 429 || (status === 403 && quota))
    return new GoogleSheetsError("rate_limited", retryAfterSecondsOf(retryAfter));
  if (status === 403) {
    const ours = words.reasons.some((reason) => projectReasons.has(reason.toLowerCase()));
    return new GoogleSheetsError(ours ? "unavailable" : "not_shared");
  }
  if (status === 404) return new GoogleSheetsError("not_found");
  if (status === 400 || status === 412) {
    if (words.message.includes("not supported for this document")) return new GoogleSheetsError("not_a_sheet");
    if (words.message.includes("unable to parse range")) return new GoogleSheetsError("tab_missing");
  }
  return new GoogleSheetsError("unavailable");
}
