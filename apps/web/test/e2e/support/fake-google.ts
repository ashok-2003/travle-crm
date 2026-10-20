// A fake Google for the journeys (spec 11): the two Sheets v4 endpoints the real adapter calls, over HTTP, answering
// errors in Google's own body shapes, played from one in-memory Google; and a control surface the journeys use to make,
// share, change and break spreadsheets. The api and the worker run their real adapter against it (the test server's
// URL), so what the journeys see is what the product does; nothing here is ever sent to Google.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  createMemoryGoogleSheets,
  GoogleSheetsError,
  type GoogleSheetsErrorReason,
  type MemoryGoogleSheets,
} from "@travel-crm/integrations/google-sheets";

type NewSpreadsheet = Parameters<MemoryGoogleSheets["addSpreadsheet"]>[0];
interface FailOptions {
  retryAfterSeconds?: number;
  times?: number;
}

/** What the journeys do to the fake, each a call to its control surface. */
export interface FakeGoogleClient {
  /** The address the connect screen shows, which spreadsheets are shared with. */
  accountEmail(): Promise<string>;
  addSpreadsheet(sheet: NewSpreadsheet): Promise<void>;
  share(spreadsheetId: string): Promise<void>;
  unshare(spreadsheetId: string): Promise<void>;
  deleteSpreadsheet(spreadsheetId: string): Promise<void>;
  append(spreadsheetId: string, tabTitle: string, row: string[]): Promise<void>;
  insertAt(spreadsheetId: string, tabTitle: string, rowNumber: number, row: string[]): Promise<void>;
  deleteAt(spreadsheetId: string, tabTitle: string, rowNumber: number): Promise<void>;
  /** Sorts the data rows by one column's text; the header stays in row 1. */
  sort(spreadsheetId: string, tabTitle: string, order: { column: number; descending?: boolean }): Promise<void>;
  editCell(
    spreadsheetId: string,
    tabTitle: string,
    rowNumber: number,
    columnIndex: number,
    value: string,
  ): Promise<void>;
  renameTab(spreadsheetId: string, gid: string, title: string): Promise<void>;
  failNext(reason: GoogleSheetsErrorReason, options?: FailOptions): Promise<void>;
  calls(): Promise<{ total: number; describes: number; reads: number }>;
}

export interface FakeGoogle {
  /** The base URL the api and the worker are given as GOOGLE_SHEETS_TEST_SERVER_URL. */
  url: string;
  stop(): Promise<void>;
  client: FakeGoogleClient;
}

/** The client of a fake that is running at `url`, for the journeys' own processes (E2E_GOOGLE_URL). */
export function fakeGoogleClient(url: string): FakeGoogleClient {
  const call = async <T>(method: string, ...args: unknown[]): Promise<T> => {
    const response = await fetch(new URL(`/control/${method}`, url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!response.ok) throw new Error(`The fake Google refused ${method}: ${await response.text()}`);
    return (await response.json()) as T;
  };
  const run = async (method: string, ...args: unknown[]): Promise<void> => {
    await call(method, ...args);
  };
  return {
    accountEmail: () => call<string>("accountEmail"),
    addSpreadsheet: (sheet) => run("addSpreadsheet", sheet),
    share: (id) => run("share", id),
    unshare: (id) => run("unshare", id),
    deleteSpreadsheet: (id) => run("deleteSpreadsheet", id),
    append: (id, tab, row) => run("append", id, tab, row),
    insertAt: (id, tab, rowNumber, row) => run("insertAt", id, tab, rowNumber, row),
    deleteAt: (id, tab, rowNumber) => run("deleteAt", id, tab, rowNumber),
    sort: (id, tab, order) => run("sort", id, tab, order),
    editCell: (id, tab, rowNumber, columnIndex, value) => run("editCell", id, tab, rowNumber, columnIndex, value),
    renameTab: (id, gid, title) => run("renameTab", id, gid, title),
    failNext: (reason, options) => run("failNext", reason, options ?? {}),
    calls: () => call("calls"),
  };
}

/** Google's own error bodies and statuses for each reason (the real adapter reads them back into the same reasons). */
function errorAnswer(error: unknown): { status: number; body: unknown; headers: Record<string, string> } {
  const reason = error instanceof GoogleSheetsError ? error.reason : "unavailable";
  const google = (status: number, code: string, message: string, headers: Record<string, string> = {}) => ({
    status,
    body: { error: { code: status, message, status: code } },
    headers,
  });
  switch (reason) {
    case "not_shared":
      return google(403, "PERMISSION_DENIED", "The caller does not have permission");
    case "not_found":
      return google(404, "NOT_FOUND", "Requested entity was not found.");
    case "not_a_sheet":
      return google(400, "FAILED_PRECONDITION", "This operation is not supported for this document");
    case "tab_missing":
      return google(400, "INVALID_ARGUMENT", "Unable to parse range: the tab is not there");
    case "rate_limited": {
      const seconds = error instanceof GoogleSheetsError ? error.retryAfterSeconds : null;
      return google(
        429,
        "RESOURCE_EXHAUSTED",
        "Quota exceeded",
        seconds === null ? {} : { "retry-after": String(seconds) },
      );
    }
    default:
      return google(503, "UNAVAILABLE", "The service is currently unavailable.");
  }
}

const rangePattern = /^'((?:[^']|'')*)'!([A-Z]+)(\d+):([A-Z]+)(\d+)$/;
const readLimits = { maxColumns: 50, maxCellLength: 4_000 };

/** One requested range ('Tab'!A1:AX1, 'Tab'!A2:AX4) as the rows Google would give, ragged and without the header's padding. */
async function valuesOfRange(google: MemoryGoogleSheets, spreadsheetId: string, range: string) {
  const match = rangePattern.exec(range);
  if (match === null) throw new GoogleSheetsError("tab_missing");
  const tabTitle = (match[1] ?? "").replaceAll("''", "'");
  const from = Number(match[3]);
  const to = Number(match[5]);
  const read = await google.readRows(0, spreadsheetId, {
    tabTitle,
    fromRow: Math.max(2, from),
    maxRows: Math.max(1, to - Math.max(2, from) + 1),
    ...readLimits,
  });
  const rows: string[][] = [];
  if (from === 1) rows.push([...read.header]);
  if (to >= 2) rows.push(...read.rows.map((row) => [...row.cells]));
  const trimmed = rows.map((cells) => {
    const end = cells.findLastIndex((cell) => cell !== "") + 1;
    return cells.slice(0, end);
  });
  while (trimmed.length > 0 && trimmed[trimmed.length - 1]?.length === 0) trimmed.pop();
  return { range, majorDimension: "ROWS", ...(trimmed.length === 0 ? {} : { values: trimmed }) };
}

async function bodyOf(request: IncomingMessage): Promise<unknown[]> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  return text === "" ? [] : (JSON.parse(text) as unknown[]);
}

function send(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(body));
}

export async function startFakeGoogle(): Promise<FakeGoogle> {
  const google = createMemoryGoogleSheets();
  const accountEmail = google.accounts()[0]?.email ?? "";

  /** The control surface: the memory Google's own methods by name. */
  const controls: Record<string, (...args: never[]) => unknown> = {
    accountEmail: () => accountEmail,
    addSpreadsheet: (sheet: NewSpreadsheet) => {
      google.addSpreadsheet(sheet);
    },
    share: (id: string) => {
      google.share(id, accountEmail);
    },
    unshare: (id: string) => {
      google.unshare(id, accountEmail);
    },
    deleteSpreadsheet: (id: string) => {
      google.deleteSpreadsheet(id);
    },
    append: (id: string, tab: string, row: string[]) => {
      google.append(id, tab, row);
    },
    insertAt: (id: string, tab: string, rowNumber: number, row: string[]) => {
      google.insertAt(id, tab, rowNumber, row);
    },
    deleteAt: (id: string, tab: string, rowNumber: number) => {
      google.deleteAt(id, tab, rowNumber);
    },
    sort: (id: string, tab: string, order: { column: number; descending?: boolean }) => {
      const direction = order.descending === true ? -1 : 1;
      google.sort(id, tab, (a, b) => direction * (a[order.column] ?? "").localeCompare(b[order.column] ?? ""));
    },
    editCell: (id: string, tab: string, rowNumber: number, columnIndex: number, value: string) => {
      google.editCell(id, tab, rowNumber, columnIndex, value);
    },
    renameTab: (id: string, gid: string, title: string) => {
      google.renameTab(id, gid, title);
    },
    failNext: (reason: GoogleSheetsErrorReason, options: FailOptions) => {
      google.failNext(reason, options);
    },
    calls: () => ({ total: google.calls.total, describes: google.calls.describes, reads: google.calls.reads }),
  };

  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://fake-google");
      try {
        const control = /^\/control\/(\w+)$/.exec(url.pathname);
        if (control !== null && request.method === "POST") {
          const handler = controls[control[1] ?? ""];
          if (handler === undefined) {
            send(response, 404, { error: "no such control" });
            return;
          }
          const result = handler(...((await bodyOf(request)) as never[]));
          send(response, 200, result ?? null);
          return;
        }
        const values = /^\/v4\/spreadsheets\/([^/]+)\/values:batchGet$/.exec(url.pathname);
        if (values !== null && request.method === "GET") {
          const id = decodeURIComponent(values[1] ?? "");
          const ranges = await Promise.all(
            url.searchParams.getAll("ranges").map((range) => valuesOfRange(google, id, range)),
          );
          send(response, 200, { spreadsheetId: id, valueRanges: ranges });
          return;
        }
        const metadata = /^\/v4\/spreadsheets\/([^/]+)$/.exec(url.pathname);
        if (metadata !== null && request.method === "GET") {
          const id = decodeURIComponent(metadata[1] ?? "");
          const description = await google.describe(0, id);
          send(response, 200, {
            properties: { title: description.title, locale: description.locale, timeZone: description.timeZone },
            sheets: description.tabs.map((tab) => ({
              properties: {
                sheetId: Number(tab.gid),
                title: tab.title,
                sheetType: tab.isGrid ? "GRID" : "OBJECT",
                gridProperties: { rowCount: tab.rowCount },
              },
            })),
          });
          return;
        }
        send(response, 404, { error: { code: 404, status: "NOT_FOUND", message: "No such endpoint" } });
        return;
      } catch (error) {
        const answer = errorAnswer(error);
        send(response, answer.status, answer.body, answer.headers);
        return;
      }
    })();
  });
  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address !== null && typeof address === "object") resolve(address.port);
      else reject(new Error("no port"));
    });
  });
  const url = `http://127.0.0.1:${String(port)}`;
  return {
    url,
    stop: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
    client: fakeGoogleClient(url),
  };
}
