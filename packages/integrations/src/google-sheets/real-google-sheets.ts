// The real GoogleSheets: plain fetch to the Sheets v4 API's two read endpoints, with a service account's token from
// google-auth-library (ADR 0031). Every request is a GET, within a timeout and a size limit; nothing is ever written.
import { JWT } from "google-auth-library";
import { columnLetters } from "../spreadsheets/sheet-shape.js";
import { mapGoogleError, parseMetadata, parseValueRanges, type SpreadsheetMetadata } from "./google-responses.js";
import {
  GOOGLE_SHEETS_SCOPE,
  type GoogleSheets,
  GoogleSheetsError,
  type ReadRowsOptions,
  type SheetDescription,
  type SheetRead,
} from "./google-sheets.js";
import { shapeRows } from "./shape-rows.js";

export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

export interface RealGoogleSheetsOptions {
  accounts: readonly ServiceAccountKey[];
  /** Default https://sheets.googleapis.com; the journeys point it at their fake (development and tests only). */
  apiBaseUrl?: string;
  /** Default: google-auth-library's JWT for the account, with the readonly scope. */
  accessToken?: (accountIndex: number) => Promise<string>;
  /** Default: `new JWT(options)`; a test passes its own to see the scope asked for. */
  createJwt?: (options: { email: string; key: string; scopes: string[] }) => {
    getAccessToken(): Promise<{ token?: string | null }>;
  };
  fetch?: typeof fetch;
  /** 20 seconds. */
  timeoutMs?: number;
  /** 25 MB. */
  maxResponseBytes?: number;
}

const describeRows = 4;
const describeColumns = 50;
const describeCellLength = 4_000;
const metadataFields =
  "properties(title,locale,timeZone),sheets(properties(sheetId,title,sheetType,gridProperties(rowCount)))";

/** One path segment: every character that could end it, or climb out of it, is encoded (S3). */
const pathSegment = (id: string) => encodeURIComponent(id).replaceAll(".", "%2E");
const quoted = (tabTitle: string) => `'${tabTitle.replaceAll("'", "''")}'`;

export function createRealGoogleSheets(options: RealGoogleSheetsOptions): GoogleSheets {
  const base = options.apiBaseUrl ?? "https://sheets.googleapis.com";
  const send = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const maxBytes = options.maxResponseBytes ?? 25 * 1024 * 1024;
  const createJwt = options.createJwt ?? ((jwtOptions) => new JWT(jwtOptions));
  const jwts = new Map<number, ReturnType<typeof createJwt>>();

  async function token(accountIndex: number): Promise<string> {
    if (options.accessToken !== undefined) return options.accessToken(accountIndex);
    const key = options.accounts[accountIndex];
    if (key === undefined) throw new RangeError("No such service account");
    let jwt = jwts.get(accountIndex);
    if (jwt === undefined) {
      jwt = createJwt({ email: key.client_email, key: key.private_key, scopes: [GOOGLE_SHEETS_SCOPE] });
      jwts.set(accountIndex, jwt);
    }
    const { token: value } = await jwt.getAccessToken();
    if (typeof value !== "string" || value === "") throw new GoogleSheetsError("unavailable");
    return value;
  }

  /** The body, read as a stream that stops at the limit. */
  async function readBody(response: Response): Promise<string> {
    const reader: ReadableStreamDefaultReader<Uint8Array> | undefined = response.body?.getReader();
    if (reader === undefined) return "";
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new GoogleSheetsError("too_large");
      }
      chunks.push(value);
    }
    return new TextDecoder().decode(Buffer.concat(chunks));
  }

  /** One GET with the account's token: the parsed JSON body, or the reason it failed. */
  async function get(accountIndex: number, url: URL): Promise<unknown> {
    if (options.accounts[accountIndex] === undefined) throw new RangeError("No such service account");
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    try {
      const response = await send(url, {
        method: "GET",
        headers: { authorization: `Bearer ${await token(accountIndex)}`, accept: "application/json" },
        redirect: "manual",
        signal: controller.signal,
      });
      const raw = await readBody(response);
      let body: unknown = null;
      try {
        body = JSON.parse(raw);
      } catch {
        // Not JSON: judged by its status, or unavailable.
      }
      if (!response.ok) throw mapGoogleError(response.status, body, response.headers.get("retry-after"));
      if (body === null) throw new GoogleSheetsError("unavailable");
      return body;
    } catch (error) {
      if (error instanceof GoogleSheetsError || error instanceof RangeError) throw error;
      throw new GoogleSheetsError("unavailable");
    } finally {
      clearTimeout(timer);
    }
  }

  const spreadsheetUrl = (spreadsheetId: string, suffix: string) =>
    new URL(`/v4/spreadsheets/${pathSegment(spreadsheetId)}${suffix}`, base);

  async function metadataOf(accountIndex: number, spreadsheetId: string): Promise<SpreadsheetMetadata> {
    const url = spreadsheetUrl(spreadsheetId, "");
    url.searchParams.set("fields", metadataFields);
    return parseMetadata(await get(accountIndex, url));
  }

  async function valuesOf(accountIndex: number, spreadsheetId: string, ranges: string[]): Promise<unknown[][][]> {
    const url = spreadsheetUrl(spreadsheetId, "/values:batchGet");
    for (const range of ranges) url.searchParams.append("ranges", range);
    url.searchParams.set("valueRenderOption", "FORMATTED_VALUE");
    url.searchParams.set("majorDimension", "ROWS");
    return parseValueRanges(await get(accountIndex, url));
  }

  return {
    accounts: () => options.accounts.map((key, index) => ({ index, email: key.client_email })),

    async describe(accountIndex, spreadsheetId, describeOptions = {}): Promise<SheetDescription> {
      const metadata = await metadataOf(accountIndex, spreadsheetId);
      const chosen =
        metadata.tabs.find((tab) => tab.gid === describeOptions.tabGid && tab.isGrid) ??
        metadata.tabs.find((tab) => tab.isGrid) ??
        null;
      let shaped: string[][] = [];
      if (chosen !== null) {
        const last = columnLetters(describeColumns - 1);
        const [values] = await valuesOf(accountIndex, spreadsheetId, [
          `${quoted(chosen.title)}!A1:${last}${String(describeRows)}`,
        ]);
        shaped = shapeRows(values ?? [], { maxColumns: describeColumns, maxCellLength: describeCellLength });
      }
      return {
        title: metadata.title,
        locale: metadata.locale,
        timeZone: metadata.timeZone,
        tabs: metadata.tabs,
        chosenTab: chosen,
        header: shaped[0] ?? [],
        sampleRows: shaped.slice(1),
      };
    },

    async readRows(accountIndex, spreadsheetId, readOptions: ReadRowsOptions): Promise<SheetRead> {
      const fromRow = Math.max(2, readOptions.fromRow);
      const firstIndex = readOptions.fromColumn ?? 0;
      const first = columnLetters(firstIndex);
      const last = columnLetters(firstIndex + readOptions.maxColumns - 1);
      const tab = quoted(readOptions.tabTitle);
      // One row past what is wanted tells whether the tab holds more, without fetching a million rows.
      const [headerRows, dataRows] = await valuesOf(accountIndex, spreadsheetId, [
        `${tab}!${first}1:${last}1`,
        `${tab}!${first}${String(fromRow)}:${last}${String(fromRow + readOptions.maxRows)}`,
      ]);
      const wanted = (dataRows ?? []).slice(0, readOptions.maxRows);
      const shaped = shapeRows([headerRows?.[0] ?? [], ...wanted], readOptions);
      const rows = shaped.slice(1).map((cells, index) => ({ rowNumber: fromRow + index, cells }));
      const lastWithValue = rows.findLast((row) => row.cells.some((cell) => cell.trim() !== ""));
      return {
        header: shaped[0] ?? [],
        rows,
        lastRow: lastWithValue?.rowNumber ?? fromRow - 1,
        truncated: (dataRows ?? []).length > readOptions.maxRows,
      };
    },
  };
}
