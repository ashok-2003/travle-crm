// Journey 5 (spec 12): an Owner exports Everyone · Contacted · Goa as Excel, waits for the worker, downloads the file
// and finds both in the audit log, the bell leading to the export's page; and a salesperson's export holds only their
// own leads.
import { readFile } from "node:fs/promises";
import type { Download, Page } from "@playwright/test";
import { leadExportHeaders } from "@travel-crm/contracts/crm";
import { createSpreadsheets } from "@travel-crm/integrations/spreadsheets";
import { expect, signInByCode, signInByEmail, test } from "./support/fixtures";
import { addLeadThroughApi, callApi, leadInput, leadWorkerAgency, moveStageThroughApi } from "./support/leads";

/** How long the worker may take to make a file on a loaded machine. */
const WORKER_STEP_MS = 60_000;

/** The file's name, its header row and the first cell of each row, read as Excel would. */
async function readDownload(download: Download) {
  const bytes = new Uint8Array(await readFile(await download.path()));
  const sheet = await createSpreadsheets().read(bytes, {
    kind: "xlsx",
    maxRows: 100,
    maxColumns: 50,
    maxCellLength: 4000,
  });
  return {
    fileName: download.suggestedFilename(),
    header: sheet.header,
    names: sheet.rows.map((row) => row.cells[0]),
    owners: sheet.rows.map((row) => row.cells[leadExportHeaders.indexOf("Owner")]),
  };
}

/** Opens the Leads header's Export, prepares the file and downloads it once the worker has made it. */
async function exportAndDownload(page: Page) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export leads" });
  await dialog.getByRole("button", { name: "Prepare the file" }).click();
  const download = dialog.getByRole("button", { name: "Download" });
  await expect(download).toBeVisible({ timeout: WORKER_STEP_MS });
  const started = page.waitForEvent("download");
  await download.click();
  return { dialog, file: await readDownload(await started) };
}

test("an Owner exports Everyone · Contacted · Goa, downloads it, and finds it in the audit log", async ({
  page,
  agency,
  addStaff,
}) => {
  test.slow();
  await signInByEmail(page, agency.owner);
  const { ravi } = await leadWorkerAgency(page, { agency, addStaff });
  const goa = { destination: { kind: "new" as const, name: "Goa" } };
  const lead = async (name: string, phone: string, ownerUserId: string | null, stages: "contacted"[], trip = goa) => {
    const leadId = await addLeadThroughApi(
      page,
      leadInput({ person: { name, phone }, ownerUserId, trip: { ...trip } }),
    );
    for (const stage of stages) await moveStageThroughApi(page, leadId, stage);
  };
  await lead("Sneha Iyer", "+919845011234", null, ["contacted"]);
  await lead("Amit Verma", "+919811045526", ravi.userId, ["contacted"]);
  await lead("Kiran Joshi", "+919004066321", null, ["contacted"], { destination: { kind: "new", name: "Manali" } });
  await lead("Priya Nair", "+919847031905", null, []);
  const places = await callApi<{ id: string; name: string }[]>(page, "destinations.search", { limit: 100 });
  const goaId = places.find((place) => place.name === "Goa")?.id;
  if (goaId === undefined) throw new Error("Goa wasn't added");

  await page.goto(`/leads?view=everyone&stage=contacted&destination=${goaId}`);
  await expect(page.getByRole("main").getByText("Sneha Iyer").first()).toBeVisible();
  const { dialog, file } = await exportAndDownload(page);
  await expect(dialog.getByText("Everyone · Contacted · Goa")).toBeVisible();
  expect(file.fileName).toMatch(/^leads-\d{4}-\d{2}-\d{2}-\d{4}\.xlsx$/);
  expect(file.header).toEqual([...leadExportHeaders]);
  expect(file.names).toEqual(["Amit Verma", "Sneha Iyer"]);
  await dialog.getByRole("button", { name: "Close" }).first().click();

  // The bell says it is ready and leads to the export's page, which still holds the file.
  await page.reload();
  await page
    .getByRole("button", { name: /^Notifications/ })
    .filter({ visible: true })
    .click();
  await page
    .getByRole("dialog", { name: "Notifications" })
    .getByRole("link", { name: /Your leads export is ready/ })
    .click();
  await expect(page).toHaveURL(/\/leads\/exports\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: "Leads export" })).toBeVisible();
  await expect(page.getByText("Everyone · Contacted · Goa")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download" })).toBeVisible();

  await page.goto("/settings/audit");
  const entries = page.getByRole("list", { name: "Changes" }).getByRole("listitem");
  await expect(entries.filter({ hasText: "Made an export file" })).toHaveCount(1);
  await expect(entries.filter({ hasText: "Downloaded an export file" })).toHaveCount(1);
});

test("a salesperson's export holds only their own leads", async ({ page, agency, addStaff }) => {
  test.slow();
  await signInByEmail(page, agency.owner);
  const { owner, ravi } = await leadWorkerAgency(page, { agency, addStaff });
  await addLeadThroughApi(page, leadInput({ person: { name: "Sneha Iyer", phone: "+919845011234" } }));
  await addLeadThroughApi(
    page,
    leadInput({ person: { name: "Amit Verma", phone: "+919811045526" }, ownerUserId: ravi.userId }),
  );
  expect(owner.userId).not.toBe(ravi.userId);

  await page.context().clearCookies();
  await signInByCode(page, { code: agency.code, staff: ravi });
  await page.goto("/leads");
  await expect(page.getByRole("main").getByText("Amit Verma").first()).toBeVisible();
  const { dialog, file } = await exportAndDownload(page);
  await expect(dialog.getByText("Mine · Open")).toBeVisible();
  expect(file.names).toEqual(["Amit Verma"]);
  expect(file.owners).toEqual(["Ravi Kumar"]);
});
