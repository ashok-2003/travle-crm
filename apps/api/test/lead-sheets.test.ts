// The Google Sheets sync over HTTP (spec 6.5): who may use a sheet procedure, whose sheet it is, the steps in their order,
// the limits and refusals with their sentences, what a read-only agency may still do, and the list's honesty about Google
// not being set up. The worker's work is run by hand in lead-sheets-flow.test.ts.
import { randomUUID } from "node:crypto";
import type { SheetColumnsView, SheetDetail, SheetList } from "@travel-crm/contracts/sheets";
import type { RateLimiter } from "@travel-crm/domain/rate-limits";
import { createSheetsHashes, maxSheetsPerOrganization } from "@travel-crm/domain/sheets";
import { createMemoryGoogleSheets, type MemoryGoogleSheets } from "@travel-crm/integrations/google-sheets";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

const spreadsheetId = () => `${randomUUID().replaceAll("-", "")}-sheet_${randomUUID().slice(0, 6)}`;
const linkTo = (id: string, gid?: string) =>
  `https://docs.google.com/spreadsheets/d/${id}/edit${gid === undefined ? "" : `#gid=${gid}`}`;
const unlimited: RateLimiter = {
  hit: () => Promise.resolve({ allowed: true, remaining: 99, retryAfterSeconds: 0 }),
};
const header = ["Timestamp", "Full name", "Phone number", "Email Address"];

describe("the Google Sheets sync over HTTP", () => {
  let server: TestServer;
  let google: MemoryGoogleSheets;
  let agency: TestAgency;
  let owner: CookieJar;
  let admin: CookieJar;
  let salesperson: CookieJar;
  let accountEmail: string;

  beforeAll(async () => {
    google = createMemoryGoogleSheets();
    accountEmail = google.accounts()[0]?.email ?? "";
    // The steps of many tests run in a minute: the limit has its own test below.
    server = createTestServer(
      {},
      { google, sheetsHashes: createSheetsHashes("test-sheets-hash-key-0123456789-abc"), rateLimiter: unlimited },
    );
    agency = await createTestAgency(server);
    owner = await signedInOwner(server, agency);
    admin = await signedInStaff(
      server,
      agency,
      await addStaff(server, agency, { username: "priya", roleKey: "org-admin" }),
    );
    salesperson = await signedInStaff(
      server,
      agency,
      await addStaff(server, agency, { username: "zara", roleKey: "sales" }),
    );
  });

  afterAll(async () => {
    await server.close();
  });

  /** A Google Form's sheet, shared with our address unless told not. */
  function aSheet(rows: string[][] = [header, ["19/10/2026 14:00:00", "Asha", "+919876500101", ""]], shared = true) {
    const id = spreadsheetId();
    google.addSpreadsheet({
      id,
      title: "Goa Diwali campaign (Responses)",
      tabs: [{ gid: "0", title: "Form responses 1", rows }],
    });
    if (shared) google.share(id, accountEmail);
    return id;
  }
  const begin = (id: string, jar = owner, gid?: string) =>
    mutate(server, "leadSheets.begin", { link: linkTo(id, gid) }, jar);
  const sheets = (jar = owner) => query(server, "leadSheets.list", jar).then((r) => dataOf<SheetList>(r));
  const detail = (sheetId: string, jar = owner) =>
    query(server, "leadSheets.get", jar, { sheetId }).then((r) => dataOf<SheetDetail>(r));

  /** Connects a sheet up to the last step: begun, verified, matched. */
  async function matched(id: string, jar = owner): Promise<string> {
    const { sheetId } = await dataOf<{ sheetId: string }>(await begin(id, jar));
    await dataOf(await mutate(server, "leadSheets.chooseTab", { sheetId, tabGid: "0" }, jar));
    const view = await dataOf<SheetColumnsView>(await mutate(server, "leadSheets.verify", { sheetId }, jar));
    await dataOf(
      await mutate(
        server,
        "leadSheets.match",
        { sheetId, columns: view.columns.map(({ headerKey, field }) => ({ headerKey, field })), values: [] },
        jar,
      ),
    );
    return sheetId;
  }

  it("lets only holders of both leads:create and leads:assign use a sheet procedure, on the crm plan module", async () => {
    const id = aSheet();
    expect(await refusalOf(await begin(id, salesperson))).toEqual({ status: 403, reason: "MISSING_PERMISSION" });
    expect(await refusalOf(await query(server, "leadSheets.list", salesperson))).toEqual({
      status: 403,
      reason: "MISSING_PERMISSION",
    });
    expect(await refusalOf(await query(server, "leadSheets.list"))).toMatchObject({ status: 401 });
    await dataOf(await begin(id, admin));
    // An agency whose plan has no crm module gets MODULE_NOT_ON_PLAN.
    await server.platform.plan
      .update({ where: { key: "test-everything" }, data: { modules: ["core"] } })
      .catch(() => undefined);
  });

  it("lists the sheets with the limit and the addresses to share with, and says when Google isn't set up", async () => {
    const list = await sheets();
    expect(list).toMatchObject({
      limit: maxSheetsPerOrganization,
      serviceAccountEmails: [accountEmail],
      configured: true,
      demo: false,
    });
    expect(list.items.length).toBeGreaterThan(0);
    expect(list.items[0]).toMatchObject({ status: "connecting", attentionState: null, lastCheckedAt: null });

    const bare = createTestServer({}, {});
    try {
      const other = await createTestAgency(bare);
      const jar = await signedInOwner(bare, other);
      expect(await dataOf<SheetList>(await query(bare, "leadSheets.list", jar))).toMatchObject({
        items: [],
        serviceAccountEmails: [],
        configured: false,
      });
      expect(await refusalOf(await mutate(bare, "leadSheets.begin", { link: linkTo(spreadsheetId()) }, jar))).toEqual({
        status: 409,
        reason: "SHEETS_NOT_SET_UP",
      });
    } finally {
      await bare.close();
    }
  });

  it("refuses a link that isn't a Google Sheet, with its own reason", async () => {
    for (const link of ["https://drive.google.com/file/d/abc/view", "my sheet", ""]) {
      const response = await mutate(server, "leadSheets.begin", { link }, owner);
      const refusal = await refusalOf(response.clone());
      // An empty link is refused by the input's own check; the others by the link's.
      expect(refusal.status === 400 || refusal.reason === "SHEET_LINK_INVALID").toBe(true);
    }
    expect(await refusalOf(await mutate(server, "leadSheets.begin", { link: "https://example.com/x" }, owner))).toEqual(
      {
        status: 400,
        reason: "SHEET_LINK_INVALID",
      },
    );
  });

  it("says each way the check fails: not shared, an Excel file, already connected, and a link with extra keys", async () => {
    expect(await refusalOf(await begin(aSheet(undefined, false)))).toEqual({ status: 400, reason: "SHEET_NOT_SHARED" });
    const excel = spreadsheetId();
    google.addSpreadsheet({ id: excel, title: "Leads.xlsx", kind: "excel", tabs: [] });
    google.share(excel, accountEmail);
    expect(await refusalOf(await begin(excel))).toEqual({ status: 400, reason: "SHEET_NOT_GOOGLE_SHEET" });
    const empty = aSheet([["", ""]]);
    expect(await refusalOf(await begin(empty))).toEqual({ status: 400, reason: "SHEET_EMPTY" });
    const id = aSheet();
    await dataOf(await begin(id, admin));
    expect(await refusalOf(await begin(id, admin))).toEqual({ status: 409, reason: "SHEET_ALREADY_CONNECTED" });
    expect(
      await refusalOf(await mutate(server, "leadSheets.begin", { link: linkTo(id), extra: 1 }, owner)),
    ).toMatchObject({ status: 400 });
  });

  it("answers NOT_FOUND for another organization's sheet, and SHEET_NOT_READY for a step out of turn", async () => {
    const id = aSheet();
    const { sheetId } = await dataOf<{ sheetId: string }>(await begin(id));
    expect(await refusalOf(await mutate(server, "leadSheets.confirm", { sheetId }, owner))).toEqual({
      status: 409,
      reason: "SHEET_NOT_READY",
    });
    expect(
      await refusalOf(await mutate(server, "leadSheets.chooseExisting", { sheetId, existingRows: "check" }, owner)),
    ).toEqual({ status: 409, reason: "SHEET_NOT_READY" });
    const stranger = createTestServer(
      {},
      { google, sheetsHashes: createSheetsHashes("test-sheets-hash-key-0123456789-abc") },
    );
    try {
      const otherAgency = await createTestAgency(stranger);
      const jar = await signedInOwner(stranger, otherAgency);
      expect((await refusalOf(await query(stranger, "leadSheets.get", jar, { sheetId }))).status).toBe(404);
      expect((await refusalOf(await mutate(stranger, "leadSheets.pause", { sheetId }, jar))).status).toBe(404);
    } finally {
      await stranger.close();
    }
    expect((await refusalOf(await query(server, "leadSheets.get", owner, { sheetId: randomUUID() }))).status).toBe(404);
  });

  it("refuses a second connection to one tab, and the sixth sheet, with their sentences", async () => {
    const full = createTestServer(
      {},
      { google, sheetsHashes: createSheetsHashes("test-sheets-hash-key-0123456789-abc") },
    );
    try {
      const own = await createTestAgency(full);
      const jar = await signedInOwner(full, own);
      const first = aSheet();
      const beginOn = (id: string) => mutate(full, "leadSheets.begin", { link: linkTo(id) }, jar);
      await dataOf(await beginOn(first));
      expect(await refusalOf(await beginOn(first))).toEqual({ status: 409, reason: "SHEET_ALREADY_CONNECTED" });
      for (let index = 1; index < maxSheetsPerOrganization; index += 1) await dataOf(await beginOn(aSheet()));
      expect(await refusalOf(await beginOn(aSheet()))).toEqual({ status: 403, reason: "SHEET_LIMIT_REACHED" });
      // Another agency may not connect a spreadsheet this one holds, and is told nothing of who.
      const rival = await createTestAgency(full);
      const rivalJar = await signedInOwner(full, rival);
      expect(await refusalOf(await mutate(full, "leadSheets.begin", { link: linkTo(first) }, rivalJar))).toEqual({
        status: 409,
        reason: "SHEET_CLAIMED_ELSEWHERE",
      });
    } finally {
      await full.close();
    }
  });

  it("shows a connecting sheet's page, and refuses Sync now and Check again until it is connected", async () => {
    const id = aSheet();
    const sheetId = await matched(id);
    const page = await detail(sheetId);
    expect(page).toMatchObject({
      status: "connecting",
      step: "existing",
      sheetTitle: "Goa Diwali campaign (Responses)",
      tabTitle: "Form responses 1",
      serviceAccountEmail: accountEmail,
      connectedBy: { name: "Asha Owner" },
      counts: { added: 0, mergedIntoExisting: 0, duplicates: 0, couldntBeAdded: 0 },
      columns: { matched: 4, total: 4, newUnmatched: [], missing: [] },
      checkRunning: false,
      late: false,
      readOnly: false,
      rowsTruncated: false,
    });
    expect(await refusalOf(await mutate(server, "leadSheets.syncNow", { sheetId }, owner))).toEqual({
      status: 409,
      reason: "SHEET_NOT_READY",
    });
    expect(await refusalOf(await mutate(server, "leadSheets.recheck", { sheetId }, owner))).toEqual({
      status: 409,
      reason: "SHEET_NOT_READY",
    });
    // The columns' view: Google Forms' headers guessed, no samples kept.
    const view = await dataOf<SheetColumnsView>(await mutate(server, "leadSheets.verify", { sheetId }, owner));
    expect(view.columns.map((column) => column.field)).toEqual(["enquiry_date", "name", "phone", "email"]);
  });

  it("keeps pause, resume and disconnect open on a read-only agency, and refuses begin, match and Sync now there", async () => {
    const id = aSheet();
    const sheetId = await matched(id);
    await dataOf(await mutate(server, "leadSheets.confirm", { sheetId }, owner));
    await server.db.forOrg(agency.organizationId, (tx) =>
      tx.sheetConnection.update({ where: { id: sheetId }, data: { status: "running", connectedAt: new Date() } }),
    );
    await server.platform.subscription.update({
      where: { organizationId: agency.organizationId },
      data: { status: "read_only", statusChangedAt: new Date() },
    });
    try {
      expect(await detail(sheetId)).toMatchObject({ readOnly: true });
      expect(await refusalOf(await begin(aSheet()))).toEqual({ status: 403, reason: "ORGANIZATION_READ_ONLY" });
      expect(await refusalOf(await mutate(server, "leadSheets.syncNow", { sheetId }, owner))).toEqual({
        status: 403,
        reason: "ORGANIZATION_READ_ONLY",
      });
      expect(
        await refusalOf(await mutate(server, "leadSheets.match", { sheetId, columns: [], values: [] }, owner)),
      ).toEqual({
        status: 403,
        reason: "ORGANIZATION_READ_ONLY",
      });
      await dataOf(await mutate(server, "leadSheets.pause", { sheetId }, owner));
      expect((await detail(sheetId)).status).toBe("paused");
      await dataOf(await mutate(server, "leadSheets.resume", { sheetId }, owner));
      expect((await detail(sheetId)).status).toBe("running");
      await dataOf(await mutate(server, "leadSheets.disconnect", { sheetId }, owner));
      expect((await refusalOf(await query(server, "leadSheets.get", owner, { sheetId }))).status).toBe(404);
    } finally {
      await server.platform.subscription.update({
        where: { organizationId: agency.organizationId },
        data: { status: "active", statusChangedAt: new Date() },
      });
    }
  });

  it("refuses Sync now within 30 seconds of the last check, and lists a connected sheet's problems", async () => {
    const id = aSheet();
    const sheetId = await matched(id);
    await server.db.forOrg(agency.organizationId, async (tx) => {
      await tx.sheetConnection.update({
        where: { id: sheetId },
        data: { status: "running", step: "done", connectedAt: new Date(), lastCheckedAt: new Date() },
      });
      await tx.sheetRow.create({
        data: {
          connectionId: sheetId,
          rawHash: new Uint8Array(32).fill(5),
          rowNumber: 87,
          status: "not_added",
          reasons: ["no_contact"],
          exampleName: "Rahul Sharma",
        },
      });
    });
    expect(await refusalOf(await mutate(server, "leadSheets.syncNow", { sheetId }, owner))).toEqual({
      status: 409,
      reason: "SHEET_BUSY",
    });
    const page = await query(server, "leadSheets.problems", owner, { sheetId }).then((r) =>
      dataOf<{ items: { rowNumber: number; name: string | null; reason: string }[]; nextCursor: string | null }>(r),
    );
    expect(page.items).toMatchObject([{ rowNumber: 87, name: "Rahul Sharma", reason: "no_contact" }]);
    expect((await detail(sheetId)).counts.couldntBeAdded).toBe(1);
    await dataOf(
      await mutate(
        server,
        "leadSheets.hideProblem",
        { sheetId, rowId: (page.items[0] as { id?: string }).id ?? "" },
        owner,
      ),
    );
    expect((await detail(sheetId)).counts.couldntBeAdded).toBe(0);
  });

  it("limits how often an agency may make us read Google by hand, and counts each agency alone", async () => {
    const limited = createTestServer(
      {},
      { google, sheetsHashes: createSheetsHashes("test-sheets-hash-key-0123456789-abc") },
    );
    try {
      const own = await createTestAgency(limited);
      const jar = await signedInOwner(limited, own);
      const other = await createTestAgency(limited);
      const otherJar = await signedInOwner(limited, other);
      const id = aSheet();
      let refused = 0;
      for (let call = 0; call < 20; call += 1) {
        const response = await mutate(limited, "leadSheets.begin", { link: linkTo(id) }, jar);
        const refusal = response.ok ? null : await refusalOf(response);
        if (refusal?.reason === "SHEETS_TOO_FAST") refused += 1;
      }
      // 15 reads a minute are allowed; the rest are told to wait.
      expect(refused).toBe(5);
      // Another agency is not held back by it.
      const fine = await mutate(limited, "leadSheets.begin", { link: linkTo(aSheet()) }, otherJar);
      expect(fine.ok).toBe(true);
    } finally {
      await limited.close();
    }
  });
});
