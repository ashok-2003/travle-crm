// The visual audit's lead import (release 2, bulk plan Task 1.9): Import leads from the first step to the last on a
// big file of every problem, as an Owner with a salesperson beside them. Choose a file with Recent imports (one
// import done, one waiting at its preview), the file on its way to storage with Stop, a file we can't read, the
// columns matched and an Owner column's values, the preview with its examples open, the Add confirmation, the add under
// way, the end; and Leads while the agency is read-only, Import off with its hint. Every lead and block is made through
// the api (R54); the imports run through the real worker.
import type { Route } from "@playwright/test";
import { expect, signInByEmail, test } from "../support/fixtures";
import { csvOf } from "../support/imports";
import { checkTheRows, csvFile, importAsGuessed, startLeadImport, WORKER_STEP_MS } from "../support/lead-import-steps";
import { addLeadThroughApi, callApi, leadInput, leadWorkerAgency } from "../support/leads";
import { setSubscriptionState } from "../support/subscription-states";
import { screenshotsOnly, shoot } from "./camera";

test.beforeEach(screenshotsOnly);

const ROWS = 6000;
const HEADER = [
  "Name",
  "Mobile No",
  "Email",
  "Destination",
  "Travel date",
  "Budget",
  "Status",
  "Assigned To",
  "Date",
  "Source",
  "Remarks",
];
const PLACES = [
  "Goa",
  "Kashmir",
  "Kerala",
  "Manali",
  "Andaman",
  "Rajasthan",
  "Gulmarg",
  "Coorg",
  "Spiti",
  "Rann of Kutch",
];

/** A big enquiry sheet with every problem a file has, in the proportions of the mockup's. */
function bigSheet(blockedPhones: string[]): string[][] {
  const rows = [HEADER];
  for (let index = 0; index < ROWS; index += 1) {
    const phone = `+9197${String(index).padStart(8, "0")}`;
    const status = ["New", "New", "New", "Called", "Called", "Booked", "Junk"][index % 7] ?? "New";
    const owner = ["Asha Sharma", "Ravi Kumar", "Asha Sharma", "Neha K"][index % 4] ?? "Asha Sharma";
    const base = [
      `Customer ${String(index)}`,
      phone,
      "",
      PLACES[index % PLACES.length] ?? "Goa",
      `${String(1 + (index % 27)).padStart(2, "0")}/12/2026`,
      index % 3 === 0 ? "1.5 lakh" : "60000",
      status,
      owner,
      `${String(1 + (index % 18)).padStart(2, "0")}/10/2026`,
      ["Instagram", "Referral", "Walk-in"][index % 3] ?? "Referral",
      index % 11 === 0 ? "Wants a houseboat" : "",
    ];
    if (index % 61 === 0) base[0] = "";
    else if (index % 97 === 0) base[1] = "";
    else if (index % 211 === 0) base[4] = "next winter";
    else if (index % 307 === 0 && blockedPhones[index / 307]) base[1] = blockedPhones[index / 307] ?? "";
    rows.push(base);
  }
  // A few rows twice, as people paste them.
  for (const index of [100, 200, 300, 400]) rows.push([...(rows[index + 1] ?? [])]);
  return rows;
}

test("the lead import, from choosing a file to the end", async ({ page, agency, addStaff, database }) => {
  test.slow();
  await signInByEmail(page, agency.owner);
  await leadWorkerAgency(page, { agency, addStaff });
  const blockedPhones = ["+919810000001", "+919810000002", "+919810000003"];
  for (const [index, phone] of blockedPhones.entries()) {
    const leadId = await addLeadThroughApi(page, leadInput({ person: { name: `Blocked ${String(index)}`, phone } }));
    await callApi(page, "leads.block", { leadId });
  }

  // Two earlier imports for Recent imports: one done, one waiting at its preview.
  await importAsGuessed(
    page,
    csvFile("enquiries-sept-2026.csv", [
      ["Name", "Phone", "Destination"],
      ["Asha Rao", "98765 20001", "Goa"],
      ["Ravi Das", "98765 20002", "Kerala"],
      ["Mani Iyer", "98765 20003", "Manali"],
    ]),
  );
  await startLeadImport(
    page,
    csvFile("goa-leads.csv", [
      ["Name", "Phone", "Destination"],
      ["Divya Nair", "98765 20004", "Goa"],
    ]),
  );
  await checkTheRows(page);

  await page.goto("/leads/import");
  await expect(
    page.getByRole("region", { name: "Recent imports" }).getByRole("link", { name: "goa-leads.csv" }),
  ).toBeVisible();
  await shoot(page, "lead-import-choose");

  // A file on its way to storage, held there so the screen shows its progress and Stop.
  const baseUrl = new URL(page.url()).origin;
  const away = (url: URL) => url.origin !== baseUrl;
  const hold = (route: Route) => {
    if (route.request().method() !== "PUT") return route.continue();
    // Never answered: the upload stays in flight.
    return new Promise<void>(() => undefined);
  };
  await page.route(away, hold);
  await page.getByRole("button", { name: "Choose a file" }).waitFor();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose a file" }).click();
  await (
    await chooser
  ).setFiles(
    csvFile("enquiries-oct-2026.csv", [
      ["Name", "Phone"],
      ["Asha", "98765 43210"],
    ]),
  );
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await shoot(page, "lead-import-uploading");
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.unroute(away, hold);

  // A file we can't read.
  await page.goto("/leads/import");
  const unreadable = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose a file" }).click();
  await (
    await unreadable
  ).setFiles({
    name: "notes.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("these are notes, not a workbook"),
  });
  await expect(page.getByText("We can't read notes.xlsx")).toBeVisible({ timeout: WORKER_STEP_MS });
  await shoot(page, "lead-import-unreadable");

  // The big file: its columns, an Owner column's values, then the preview.
  await startLeadImport(page, {
    name: "enquiries-oct-2026.csv",
    mimeType: "text/csv",
    buffer: csvOf(bigSheet(blockedPhones)),
  });
  await shoot(page, "lead-import-match");
  await shoot(page, "lead-import-match-values", {
    element: page.getByRole("region", { name: "Assigned To's values, as owners" }),
  });
  await checkTheRows(page);
  await shoot(page, "lead-import-check");
  await page.getByRole("button", { name: /^No phone, email or Instagram/ }).click();
  await expect(page.getByText(/^Row \d+/).first()).toBeVisible();
  await page.getByRole("button", { name: /^Marked Not a lead/ }).click();
  await shoot(page, "lead-import-check-examples");

  await page.getByRole("button", { name: /^Add [\d,]+ rows$/ }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await shoot(page, "lead-import-confirm");
  await page.getByRole("alertdialog").getByRole("button", { name: "Add the rows" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Adding leads" })).toBeVisible({ timeout: WORKER_STEP_MS });
  await expect(page.getByText(/^[1-9][\d,]* of [\d,]+ rows$/)).toBeVisible({ timeout: WORKER_STEP_MS });
  await shoot(page, "lead-import-adding");
  await expect(page.getByRole("heading", { level: 1, name: "Import done" })).toBeVisible({
    timeout: 4 * WORKER_STEP_MS,
  });
  await shoot(page, "lead-import-done");

  // The agency stops paying: Leads keeps Import off, with its hint.
  await setSubscriptionState(database.platform, agency.organizationId, "read_only");
  await page.goto("/leads");
  await expect(page.getByRole("main").getByRole("button", { name: "Import" })).toBeDisabled();
  await shoot(page, "lead-import-read-only");
  await page.goto("/leads/import");
  await expect(page.getByRole("button", { name: "Choose a file" })).toBeDisabled();
  await shoot(page, "lead-import-read-only-choose");
  // The import left waiting at its preview: Add and Cancel are off.
  await page.getByRole("link", { name: "goa-leads.csv" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Check before adding" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel this import" })).toBeDisabled();
  await shoot(page, "lead-import-read-only-check");
});
