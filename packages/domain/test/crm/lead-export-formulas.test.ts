// The lead export never writes a formula (B40): text that starts with =, +, -, @, a tab or a carriage return gets one
// leading apostrophe in both formats, from a customer's name to the follow-up's line, while the phone, which our code
// writes from a validated number, stays "+91 98765 43210" in .xlsx and gets the apostrophe in CSV.
import { createRequire } from "node:module";
import { createSpreadsheets } from "@travel-crm/integrations/spreadsheets";
import type { OrgTx } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeLeadExportListener } from "../../src/crm/index.js";
import { exportDetail, startExport, type ExportJobDependencies } from "../../src/exports/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { fakeExportIdentity, requested } from "../exports/test-exports.js";
import {
  anAgency,
  createTestImports,
  listenerContext,
  memberOf,
  type TestImports,
} from "../imports/support/test-imports.js";
import { aLead, aPerson, aTask } from "./support/records.js";

/** fflate, which only the integrations package depends on: found from there, to open the .xlsx as the zip it is. */
interface Fflate {
  unzipSync(bytes: Uint8Array): Record<string, Uint8Array>;
  strFromU8(bytes: Uint8Array): string;
}
const fflate = (await import(
  createRequire(new URL("../../../integrations/package.json", import.meta.url)).resolve("fflate")
)) as Fflate;

const STARTS = ["=", "+", "-", "@", "\t", "\r"] as const;
const escapeXml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\r", "&#13;");

describe("the lead export's formula safety", () => {
  let test: TestImports;
  let organizationId: string;
  let manager: MemberAccess;
  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>) => test.db.forOrg(organizationId, work);

  beforeAll(async () => {
    test = createTestImports();
    organizationId = await anAgency(test);
    manager = memberOf(organizationId, "org-admin");
    await inOrg(async (tx) => {
      for (const [index, start] of STARTS.entries()) {
        const person = await aPerson(tx, {
          name: `${start}Name ${String(index)}`,
          email: `${start}mail${String(index)}@example.test`,
        });
        const lead = await aLead(tx, { personId: person.id, ownerUserId: manager.userId });
        await tx.lead.update({ where: { id: lead.id }, data: { sourceDetail: `${start}Source ${String(index)}` } });
        await aTask(tx, {
          kind: "follow-up",
          title: `${start}Call ${String(index)}`,
          record: { recordType: "lead", recordId: lead.id },
        });
      }
    });
  });

  afterAll(async () => {
    await test.close();
  });

  /** The export's file as the real writer made it. */
  async function fileOf(format: "xlsx" | "csv"): Promise<Uint8Array> {
    const dependencies: ExportJobDependencies = {
      files: test.files,
      spreadsheets: createSpreadsheets(),
      identity: fakeExportIdentity(manager),
      appUrl: "https://app.example.test",
    };
    const { exportId } = await inOrg((tx) =>
      startExport(tx, manager, "leads", { format, filter: { view: "everyone", stage: "open" } }, new Date()),
    );
    await makeLeadExportListener(dependencies).handle(
      requested(organizationId, exportId),
      listenerContext(test, organizationId),
    );
    expect((await inOrg((tx) => exportDetail(tx, manager, "leads", exportId))).status).toBe("ready");
    const stored = test.storage.objects.get(`organizations/${organizationId}/attachments/${exportId}`);
    if (stored === undefined) throw new Error("the export's file wasn't stored");
    return stored.body;
  }

  /** The hostile text of every text column, as each cell's text should read in the file. */
  const hostile = () =>
    STARTS.flatMap((start, index) =>
      [
        `Name ${String(index)}`,
        `mail${String(index)}@example.test`,
        `Source ${String(index)}`,
        `Call ${String(index)}`,
      ].map((text) => `'${start}${text}`),
    );

  it("gives every hostile text cell one leading apostrophe in .xlsx, and the phone none", async () => {
    const sheet = fflate.strFromU8(
      fflate.unzipSync(await fileOf("xlsx"))["xl/worksheets/sheet1.xml"] ?? new Uint8Array(),
    );
    for (const text of hostile()) expect(sheet, text).toContain(`${escapeXml(text)}</t>`);
    // Never a cell that is a formula, and a text cell never starts as one (but the phone's +91).
    expect(sheet).not.toMatch(/<f[\s>]/);
    expect(sheet).not.toMatch(/<t[^>]*>(?:[=\-@\t\r]|\+(?!91 ))/);
    // The phone is the one exception: as validated, it stays as written, six of them.
    expect(sheet.match(/<t>\+91 \d{5} \d{5}<\/t>/g)).toHaveLength(STARTS.length);
    expect(sheet).not.toContain("'+91");
  });

  it("gives every hostile text cell one leading apostrophe in CSV, the phone too", async () => {
    const csv = new TextDecoder().decode(await fileOf("csv"));
    for (const text of hostile()) expect(csv, text).toContain(`"${text}"`);
    expect(csv.match(/"'\+91 \d{5} \d{5}"/g)).toHaveLength(STARTS.length);
    expect(csv).not.toMatch(/"\+91 /);
  });
});
