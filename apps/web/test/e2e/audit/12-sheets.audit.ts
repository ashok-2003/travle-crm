// The visual audit's Google Sheets sync (sheets plan, Task 21): Lead sources empty, listed and full; the connect steps
// (the address, a sheet not shared, the columns with an Owner column's values, the rows already there, the confirmation,
// reading); the import's preview with "Already in your CRM"; a sheet's page running, with problems, late, and in each
// state that stops it (lost access, a tab or columns gone, no manager, paused, read-only); and Disconnect. Sheets are
// connected through the product against the fake Google; the states are written into the database the way the worker
// would leave them, since a camera cannot wait for a sheet to fail.
import type { Page } from "@playwright/test";
import { expect, signInByEmail, test } from "../support/fixtures";
import { addLeadThroughApi, leadInput } from "../support/leads";
import { aGoogleForm, answer, connectSheet, fakeGoogle, FORM_HEADER, linkTo, pasteSheetLink } from "../support/sheets";
import { setSubscriptionState } from "../support/subscription-states";
import { screenshotsOnly, shoot } from "./camera";

test.beforeEach(screenshotsOnly);

/** The page's answer for one sheet, changed on its way, as the worker would have left the sheet. */
async function holdSheetAs(page: Page, changes: Record<string, unknown>): Promise<void> {
  await page.route("**/api/trpc/leadSheets.get*", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { result?: { data?: Record<string, unknown> } }[];
    await route.fulfill({
      response,
      json: body.map((item) => (item.result?.data ? { result: { data: { ...item.result.data, ...changes } } } : item)),
    });
  });
}

test("Google Sheets: Lead sources, connecting, a sheet's page and each state that stops it", async ({
  page,
  agency,
  database,
}) => {
  test.setTimeout(900_000);
  const google = fakeGoogle();
  await signInByEmail(page, agency.owner);
  await addLeadThroughApi(page, leadInput({ person: { name: "Rahul Sharma", phone: "+919820098200" } }));

  await page.goto("/settings/lead-sources");
  await expect(page.getByRole("heading", { level: 1, name: "Lead sources" })).toBeVisible();
  await expect(page.getByText("No sheet is connected.")).toBeVisible();
  await shoot(page, "lead-sources-empty");

  await page.goto("/settings/lead-sources/sheets/connect");
  await expect(page.getByRole("textbox", { name: "Our address" })).toHaveValue(await google.accountEmail());
  await shoot(page, "sheet-connect-share");
  const unshared = await aGoogleForm(google, { shared: false });
  await page.getByRole("textbox", { name: "Sheet link" }).fill(linkTo(unshared.id));
  await page.getByRole("button", { name: "Check the sheet" }).click();
  await expect(page.getByText(/We can't open that sheet yet/)).toBeVisible();
  await shoot(page, "sheet-connect-not-shared");

  // A Google Form's sheet with an Owner column, connected step by step.
  const form = await aGoogleForm(google, {
    title: "Goa Diwali campaign (Responses)",
    header: [...FORM_HEADER, "Where do you want to go?", "Handled by"],
    rows: [
      answer("Priya Nair", "98450 12345", ["Goa", "Asha Sharma"]),
      answer("Meera Iyer", "98200 11122", ["Kerala", "Neha"]),
      answer("Anil Kapoor", "98111 22233", ["Goa", "Asha Sharma"]),
    ],
  });
  await pasteSheetLink(page, form.link);
  await expect(page.getByRole("heading", { level: 1, name: "Match columns" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("region", { name: /Values of ‘Handled by’/ })).toBeVisible();
  await shoot(page, "sheet-connect-columns");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Rows already in the sheet" })).toBeVisible();
  await shoot(page, "sheet-connect-existing");
  await page.getByRole("button", { name: "Connect the sheet" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await shoot(page, "sheet-connect-confirm");
  // The worker is quicker than a camera: the page's answer is held at "reading" for the shot.
  await holdSheetAs(page, { status: "connecting", step: "done" });
  await page.getByRole("alertdialog").getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByText("Reading your sheet…")).toBeVisible();
  await shoot(page, "sheet-connect-reading");
  await page.unroute("**/api/trpc/leadSheets.get*");
  await expect(page.getByRole("heading", { level: 1, name: form.title })).toBeVisible({ timeout: 60_000 });
  const sheetUrl = page.url();
  const sheetId = sheetUrl.split("/").at(-1) ?? "";
  await shoot(page, "sheet-page");

  // The rows that couldn't be added, as the worker leaves them.
  const row = (rowNumber: number, name: string, reasons: string[], hashByte: number) => ({
    organizationId: agency.organizationId,
    connectionId: sheetId,
    rawHash: Buffer.alloc(32, hashByte),
    rowNumber,
    status: "not_added",
    reasons,
    exampleName: name,
  });
  await database.platform.sheetRow.createMany({
    data: [
      row(87, "Rahul Sharma", ["no_contact"], 1),
      row(212, "Suresh Menon", ["blocked"], 2),
      row(240, "Aditi Rao", ["no_name"], 3),
    ],
  });
  await page.goto(sheetUrl);
  await expect(page.getByRole("region", { name: "Couldn't be added" })).toBeVisible();
  await shoot(page, "sheet-page-problems");

  // Checks running late: the last one is forty minutes old.
  await database.platform.sheetConnection.update({
    where: { id: sheetId },
    data: { lastCheckedAt: new Date(Date.now() - 40 * 60_000) },
  });
  await page.goto(sheetUrl);
  await expect(page.getByText(/Checks are running late/)).toBeVisible();
  await shoot(page, "sheet-page-late");
  await database.platform.sheetConnection.update({ where: { id: sheetId }, data: { lastCheckedAt: new Date() } });

  // Each state that stops a sheet.
  const states: [string, string, string][] = [
    ["lost_access", "sheet-lost-access", "We can't open this sheet any more"],
    ["tab_missing", "sheet-tab-missing", "This sheet's tab is gone"],
    ["columns_missing", "sheet-columns-missing", "A column we need is gone"],
    ["needs_manager", "sheet-needs-manager", "This sheet needs a manager"],
    ["paused", "sheet-paused", "This sheet is paused"],
  ];
  for (const [status, shot, title] of states) {
    await database.platform.sheetConnection.update({
      where: { id: sheetId },
      data: { status, attentionSince: status === "paused" ? null : new Date(Date.now() - 26 * 60 * 60_000) },
    });
    if (status === "columns_missing") {
      await database.platform.sheetColumn.updateMany({
        where: { connectionId: sheetId, field: { in: ["name", "phone"] } },
        data: { isMissing: true },
      });
    }
    await page.goto(sheetUrl);
    await expect(page.getByText(title)).toBeVisible();
    if (status === "tab_missing") await expect(page.getByRole("combobox", { name: "Tab" })).toBeVisible();
    await shoot(page, shot as Parameters<typeof shoot>[1]);
  }
  await database.platform.sheetColumn.updateMany({ where: { connectionId: sheetId }, data: { isMissing: false } });
  await database.platform.sheetConnection.update({
    where: { id: sheetId },
    data: { status: "running", attentionSince: null },
  });

  // The list, with a second sheet being set up through the preview of its rows, and a third that lost access.
  // The steps above asked Google for most of an agency's minute (twenty requests): the next connect waits it out.
  await page.waitForTimeout(61_000);
  const second = await aGoogleForm(google, {
    title: "Rows already there (Responses)",
    rows: [
      answer("Priya Nair", "98450 12345"),
      answer("Meera Iyer", "98450 54321"),
      answer("Rahul Sharma", "98200 98200"),
    ],
  });
  await connectSheet(page, { link: second.link, existing: "check" });
  await expect(page.getByText("Already in your CRM").first()).toBeVisible();
  await shoot(page, "sheet-import-check-in-crm");

  const third = await aGoogleForm(google, { title: "Walk-in and phone enquiries", tab: "Enquiries" });
  await connectSheet(page, { link: third.link, existing: "only_new" });
  const thirdId = page.url().split("/").at(-1) ?? "";
  await database.platform.sheetConnection.update({
    where: { id: thirdId },
    data: { status: "lost_access", attentionSince: new Date(Date.now() - 26 * 60 * 60_000) },
  });
  await page.goto("/settings/lead-sources");
  await expect(page.getByText("Lost access", { exact: true })).toBeVisible();
  await shoot(page, "lead-sources-list");

  for (const title of ["Kerala backwaters", "Instagram ads"]) {
    const more = await aGoogleForm(google, { title });
    await connectSheet(page, { link: more.link, existing: "only_new" });
  }
  await page.goto("/settings/lead-sources");
  await expect(page.getByRole("button", { name: "Connect a sheet" })).toBeDisabled();
  await shoot(page, "lead-sources-limit");

  // Disconnect asks, naming what stays; then the subscription is read-only.
  await page.goto(sheetUrl);
  await page.getByRole("button", { name: "More actions for this sheet" }).click();
  await page.getByRole("menuitem", { name: "Disconnect" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await shoot(page, "sheet-disconnect");
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await setSubscriptionState(database.platform, agency.organizationId, "read_only");
  await page.goto(sheetUrl);
  await expect(page.getByText("Paused while your subscription is read-only")).toBeVisible();
  await shoot(page, "sheet-read-only");
});
