// The real adapter against an injected fetch: requests made, Google's answers mapped, limits kept.
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryLogger } from "../../src/logging/index.js";
import {
  createRealGoogleSheets,
  GOOGLE_SHEETS_SCOPE,
  GoogleSheetsError,
  type GoogleSheetsErrorReason,
  type ReadRowsOptions,
} from "@travel-crm/integrations/google-sheets";

const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-aaa";
const accounts = [
  { client_email: "one@x.iam.gserviceaccount.com", private_key: "k1" },
  { client_email: "two@x.iam.gserviceaccount.com", private_key: "k2" },
];
const read: ReadRowsOptions = {
  tabTitle: "Form responses 1",
  fromRow: 2,
  maxRows: 3,
  maxColumns: 4,
  maxCellLength: 10,
};

interface Recorded {
  status: number;
  headers?: Record<string, string>;
  body: unknown;
}
const recorded = (name: string): Recorded =>
  JSON.parse(readFileSync(path.join(import.meta.dirname, "recorded", `${name}.json`), "utf8")) as Recorded;

const asResponse = ({ status, headers, body }: Recorded) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const metadataBody = {
  properties: { title: "Goa Diwali campaign", locale: "en_IN", timeZone: "Asia/Kolkata" },
  sheets: [
    { properties: { sheetId: 0, title: "Chart", sheetType: "OBJECT" } },
    { properties: { sheetId: 55, title: "Form responses 1", sheetType: "GRID", gridProperties: { rowCount: 1000 } } },
  ],
};

interface Call {
  url: URL;
  init: RequestInit | undefined;
}

function fakeFetch(answer: (url: URL, call: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const send = (input: URL | string | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    calls.push({ url, init });
    return Promise.resolve(answer(url, calls.length));
  };
  return { calls, send: send };
}

const adapterWith = (
  send: typeof fetch,
  extra: Parameters<typeof createRealGoogleSheets>[0] extends infer O ? Partial<O> : never = {},
) =>
  createRealGoogleSheets({
    accounts,
    fetch: send,
    accessToken: (index) => Promise.resolve(`token-${String(index)}`),
    ...extra,
  });

afterEach(() => {
  vi.useRealTimers();
});

describe("createRealGoogleSheets", () => {
  it("makes only GET requests, to the two endpoints, with the id as one encoded path segment", async () => {
    const { calls, send } = fakeFetch((url) =>
      url.pathname.endsWith("/values:batchGet")
        ? asResponse({ status: 200, body: { valueRanges: [{ values: [["Name"]] }] } })
        : asResponse({ status: 200, body: metadataBody }),
    );
    const google = adapterWith(send);
    await google.describe(0, id);
    expect(calls.every((call) => call.init?.method === "GET")).toBe(true);
    expect(calls.map((call) => call.url.pathname)).toEqual([
      `/v4/spreadsheets/${id}`,
      `/v4/spreadsheets/${id}/values:batchGet`,
    ]);
    expect(new Set(calls.map((call) => call.url.origin))).toEqual(new Set(["https://sheets.googleapis.com"]));
  });

  it("refuses an id that is not 20 to 80 letters, digits, dashes and underscores, without a request (SC7)", async () => {
    const { calls, send } = fakeFetch(() => asResponse({ status: 200, body: metadataBody }));
    const google = adapterWith(send);
    for (const bad of ["../x", "a".repeat(19), "a".repeat(81), `${id}.`, `${id}/..`, `${id}%2E`, `${id}?x=1`, ""]) {
      await expect(google.describe(0, bad), bad).rejects.toMatchObject({ reason: "not_found" });
      await expect(google.readRows(0, bad, read), bad).rejects.toMatchObject({ reason: "not_found" });
    }
    expect(calls).toHaveLength(0);
  });

  it("asks for FORMATTED_VALUE and only the fields describe needs", async () => {
    const { calls, send } = fakeFetch((url) =>
      url.pathname.endsWith("/values:batchGet")
        ? asResponse({ status: 200, body: { valueRanges: [{ values: [["Name"]] }] } })
        : asResponse({ status: 200, body: metadataBody }),
    );
    await adapterWith(send).describe(0, id, { tabGid: "55" });
    const [metadata, values] = calls;
    expect(metadata?.url.searchParams.get("fields")).toBe(
      "properties(title,locale,timeZone),sheets(properties(sheetId,title,sheetType,gridProperties(rowCount)))",
    );
    expect(values?.url.searchParams.get("valueRenderOption")).toBe("FORMATTED_VALUE");
    expect(values?.url.searchParams.get("majorDimension")).toBe("ROWS");
    expect(values?.url.searchParams.getAll("ranges")).toEqual(["'Form responses 1'!A1:AX4"]);
  });

  it("describes the chosen grid tab, skipping a chart", async () => {
    const { send } = fakeFetch((url) =>
      url.pathname.endsWith("/values:batchGet")
        ? asResponse({
            status: 200,
            body: { valueRanges: [{ values: [["Name", "#REF!"], ["Asha"], ["Ravi", "x"]] }] },
          })
        : asResponse({ status: 200, body: metadataBody }),
    );
    const description = await adapterWith(send).describe(0, id);
    expect(description).toMatchObject({ title: "Goa Diwali campaign", locale: "en_IN", timeZone: "Asia/Kolkata" });
    expect(description.chosenTab).toEqual({ gid: "55", title: "Form responses 1", isGrid: true, rowCount: 1000 });
    expect(description.tabs.map((tab) => tab.isGrid)).toEqual([false, true]);
    expect(description.header).toEqual(["Name", ""]);
    expect(description.sampleRows).toEqual([
      ["Asha", ""],
      ["Ravi", "x"],
    ]);
  });

  it("reads the header and the rows in one request, one row past what is wanted", async () => {
    const { calls, send } = fakeFetch(() =>
      asResponse({
        status: 200,
        body: {
          valueRanges: [
            { values: [["Name", "Phone"]] },
            { values: [["Asha", "098765 43210"], [], ["Ravi"], ["Meena"]] },
          ],
        },
      }),
    );
    const result = await adapterWith(send).readRows(1, id, read);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url.searchParams.getAll("ranges")).toEqual([
      "'Form responses 1'!A1:D1",
      "'Form responses 1'!A2:D5",
    ]);
    expect(result.truncated).toBe(true);
    expect(result.rows).toEqual([
      { rowNumber: 2, cells: ["Asha", "098765 432"] },
      { rowNumber: 3, cells: ["", ""] },
      { rowNumber: 4, cells: ["Ravi", ""] },
    ]);
    expect(result.lastRow).toBe(4);
  });

  it("sends the account's token as a bearer token, per account", async () => {
    const { calls, send } = fakeFetch(() => asResponse({ status: 200, body: { valueRanges: [{}, {}] } }));
    const google = adapterWith(send);
    await google.readRows(0, id, read);
    await google.readRows(1, id, read);
    const headers = calls.map((call) => new Headers(call.init?.headers).get("authorization"));
    expect(headers).toEqual(["Bearer token-0", "Bearer token-1"]);
  });

  it("builds the default token source with the readonly scope", async () => {
    const created: { email: string; key: string; scopes: string[]; transporterOptions: { timeout: number } }[] = [];
    const { calls, send } = fakeFetch(() => asResponse({ status: 200, body: { valueRanges: [{}, {}] } }));
    const google = createRealGoogleSheets({
      accounts,
      fetch: send,
      createJwt: (options) => {
        created.push(options);
        return { getAccessToken: () => Promise.resolve({ token: "jwt-token" }) };
      },
    });
    await google.readRows(1, id, read);
    await google.readRows(1, id, read);
    expect(created).toEqual([
      {
        email: accounts[1]?.client_email,
        key: "k2",
        scopes: [GOOGLE_SHEETS_SCOPE],
        transporterOptions: { timeout: 20_000 },
      },
    ]);
    expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe("Bearer jwt-token");
    expect(google.accounts()).toEqual([
      { index: 0, email: accounts[0]?.client_email },
      { index: 1, email: accounts[1]?.client_email },
    ]);
  });

  const cases: [string, GoogleSheetsErrorReason, number | null][] = [
    ["forbidden", "not_shared", null],
    ["not-found", "not_found", null],
    ["bad-range", "tab_missing", null],
    ["not-a-sheet", "not_a_sheet", null],
    ["quota-403", "rate_limited", null],
    ["project-service-disabled", "unavailable", null],
    ["project-unknown-error-info", "unavailable", null],
    ["project-scope-insufficient", "unavailable", null],
    ["project-suspended", "unavailable", null],
    ["project-user-denied", "unavailable", null],
    ["rate-limited", "rate_limited", 120],
    ["unavailable", "unavailable", null],
  ];
  it.each(cases)("maps the recorded %s to %s", async (name, reason, retryAfterSeconds) => {
    const { send } = fakeFetch(() => asResponse(recorded(name)));
    await expect(adapterWith(send).readRows(0, id, read)).rejects.toMatchObject({ reason, retryAfterSeconds });
  });

  it("keeps the ErrorInfo reason code of a 403 that is not a sheet's sharing, and none for a plain 403", async () => {
    const { send } = fakeFetch(() => asResponse(recorded("project-unknown-error-info")));
    await expect(adapterWith(send).readRows(0, id, read)).rejects.toMatchObject({
      reason: "unavailable",
      googleReason: "SOME_NEW_POLICY",
    });
    const plain = fakeFetch(() => asResponse(recorded("forbidden")));
    await expect(adapterWith(plain.send).readRows(0, id, read)).rejects.toMatchObject({
      reason: "not_shared",
      googleReason: null,
    });
  });

  it("maps a 429 without Retry-After, a 500 and a 401 to reasons", async () => {
    const reasons: [number, GoogleSheetsErrorReason, number | null][] = [
      [429, "rate_limited", null],
      [500, "unavailable", null],
      [401, "unavailable", null],
    ];
    for (const [status, reason, retryAfterSeconds] of reasons) {
      const { send } = fakeFetch(() => new Response("{}", { status }));
      await expect(adapterWith(send).describe(0, id)).rejects.toMatchObject({ reason, retryAfterSeconds });
    }
  });

  it("maps a body that does not parse, and a redirect, to unavailable", async () => {
    for (const answer of [new Response("<html>", { status: 200 }), new Response("{}", { status: 200 })]) {
      const { send } = fakeFetch(() => answer.clone());
      await expect(adapterWith(send).describe(0, id)).rejects.toMatchObject({ reason: "unavailable" });
    }
    const { send } = fakeFetch(() => new Response(null, { status: 302, headers: { location: "https://evil.test" } }));
    await expect(adapterWith(send).describe(0, id)).rejects.toMatchObject({ reason: "unavailable" });
  });

  it("maps a network error and a request past the timeout to unavailable", async () => {
    const failing = fakeFetch(() => Promise.reject(new Error("socket hang up secret-title")));
    await expect(adapterWith(failing.send).describe(0, id)).rejects.toMatchObject({ reason: "unavailable" });

    vi.useFakeTimers();
    const hanging = (_input: URL | string | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    const pending = adapterWith(hanging).describe(0, id);
    const outcome = expect(pending).rejects.toMatchObject({ reason: "unavailable" });
    await vi.advanceTimersByTimeAsync(20_000);
    await outcome;
  });

  it("gives up on a token request that hangs past the timeout (SC6)", async () => {
    vi.useFakeTimers();
    const { calls, send } = fakeFetch(() => asResponse({ status: 200, body: metadataBody }));
    const google = createRealGoogleSheets({
      accounts,
      fetch: send,
      createJwt: () => ({ getAccessToken: () => new Promise(() => undefined) }),
    });
    const outcome = expect(google.describe(0, id)).rejects.toMatchObject({ reason: "unavailable" });
    await vi.advanceTimersByTimeAsync(20_000);
    await outcome;
    expect(calls).toHaveLength(0);
  });

  it("logs a Google failure once per account per streak, as the account and the reason alone (SC4)", async () => {
    const logger = createMemoryLogger();
    let answer: () => Response = () => asResponse(recorded("project-service-disabled"));
    const { send } = fakeFetch(() => answer());
    const google = adapterWith(send, { logger });
    for (let attempt = 0; attempt < 3; attempt += 1) await google.readRows(0, id, read).catch(() => undefined);
    await google.readRows(1, id, read).catch(() => undefined);
    expect(logger.entries).toMatchObject([
      { level: "warn", account: 0, reason: "unavailable", googleReason: "SERVICE_DISABLED" },
      { level: "warn", account: 1, reason: "unavailable", googleReason: "SERVICE_DISABLED" },
    ]);
    // A sheet-level answer (not shared) is Google answering normally: it ends the streak, and is not logged.
    answer = () => asResponse(recorded("forbidden"));
    await google.readRows(0, id, read).catch(() => undefined);
    answer = () => asResponse(recorded("rate-limited"));
    await google.readRows(0, id, read).catch(() => undefined);
    expect(logger.entries.slice(2)).toMatchObject([{ account: 0, reason: "rate_limited" }]);
    expect(JSON.stringify(logger.entries)).not.toMatch(/project|1AbCd|token/);
  });

  it("never puts a sheet's content, a title or a token in an error's message", async () => {
    const leaky = {
      error: { code: 403, message: "Secret Sheet Title token-0 for secret@x.test", status: "PERMISSION_DENIED" },
    };
    const { send } = fakeFetch(() => asResponse({ status: 403, body: leaky }));
    const error = await adapterWith(send)
      .describe(0, id)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GoogleSheetsError);
    expect((error as Error).message).toBe("Google Sheets: not_shared");
    const network = fakeFetch(() => Promise.reject(new Error("Bearer token-0 Secret Sheet Title")));
    const other = await adapterWith(network.send)
      .describe(0, id)
      .catch((caught: unknown) => caught);
    expect((other as Error).message).toBe("Google Sheets: unavailable");
  });

  it("stops reading a 30 MB body at 25 MB with too_large", async () => {
    let pulled = 0;
    const chunk = new Uint8Array(1024 * 1024).fill(32);
    const { send } = fakeFetch(
      () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              if (pulled >= 30) controller.close();
              else {
                pulled += 1;
                controller.enqueue(chunk);
              }
            },
          }),
          { status: 200 },
        ),
    );
    await expect(adapterWith(send).readRows(0, id, read)).rejects.toMatchObject({ reason: "too_large" });
    expect(pulled).toBeLessThanOrEqual(27);
    expect(pulled).toBeGreaterThanOrEqual(25);
  });

  it("pads, cuts and empties error values as the memory adapter does", async () => {
    const { send } = fakeFetch(() =>
      asResponse({
        status: 200,
        body: {
          valueRanges: [
            { values: [["Name", "Phone", "City"]] },
            {
              values: [
                ["Asha", "#N/A"],
                ["Ravi", "098765 43210", "#REF! in B3"],
              ],
            },
          ],
        },
      }),
    );
    const result = await adapterWith(send).readRows(0, id, { ...read, maxCellLength: 4_000 });
    expect(result.rows.map((row) => row.cells)).toEqual([
      ["Asha", "", ""],
      ["Ravi", "098765 43210", "#REF! in B3"],
    ]);
  });

  it("refuses an account index it doesn't have", async () => {
    const { send } = fakeFetch(() => asResponse({ status: 200, body: {} }));
    await expect(adapterWith(send).describe(9, id)).rejects.toBeInstanceOf(RangeError);
  });
});
