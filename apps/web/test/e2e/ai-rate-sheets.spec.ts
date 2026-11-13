// AI part 4b (release ai3b), on a phone and a desktop, against the real api and worker with the fake AI (support/fake-openrouter.ts):
// - a supplier's rate sheet (an Excel file) is read: each row shows the words and place it came from; Save stays shut until every
//   price has its own tick; the person fixes a price; the rates are saved through the supplier's own writes, audited with the reading;
// - a sheet too big for one read is offered by part first (no AI call used), a part is read, saved, and the next one offered; the
//   second part goes into the season the first made.
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Page, TestInfo } from "@playwright/test";
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { xlsxOf } from "./support/imports";
import { callApi } from "./support/leads";
import { aSupplier } from "./support/packages";
import { inAgency } from "./support/whatsapp";

const shots = path.join(process.cwd(), "..", "..", "shots", "ai3b");
const isPhone = (testInfo: TestInfo) => testInfo.project.name === "phone";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** A picture of the screen at the sizes the review looks at (a phone 390 wide, a desktop 1440), then the journey's own size again. */
async function shoot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  mkdirSync(shots, { recursive: true });
  const before = page.viewportSize();
  await page.setViewportSize(isPhone(testInfo) ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await page.screenshot({ path: path.join(shots, `${testInfo.project.name}-${name}.png`) });
  if (before !== null) await page.setViewportSize(before);
}

const turnOnAi = (page: Page) => callApi(page, "ai.saveSettings", { enabled: true, scoring: true, writeStyle: "warm" });

async function openRateSheet(page: Page, supplierId: string) {
  await page.goto(`/suppliers/${supplierId}`);
  await page.getByRole("region", { name: "Rates" }).getByRole("button", { name: "Read a rate sheet" }).click();
  return page.getByRole("dialog", { name: "Read a rate sheet" });
}

test("a rate sheet is read, every price is ticked, and the rates are saved as the person left them", async ({
  page,
  agency,
}, testInfo) => {
  test.setTimeout(300_000);
  await signInByEmail(page, agency.owner);
  await turnOnAi(page);
  const supplierId = await aSupplier(page);
  const dialog = await openRateSheet(page, supplierId);
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "hotel-rates.xlsx",
    mimeType: XLSX,
    buffer: await xlsxOf([
      ["Room", "Plan", "Rate"],
      ["Deluxe room", "MAP", "4,500"],
      ["Suite", "MAP", "7,000"],
      ["Cottage", "MAP", "3,000"],
    ]),
  });
  await dialog.getByRole("button", { name: "Read the sheet" }).click();

  // Three rows, each with the sheet's own line beside it; the season is new and dated.
  await expect(dialog.getByText("3 rates found")).toBeVisible();
  await expect(dialog.getByText("Sheet1, row 3")).toBeVisible();
  await expect(dialog.getByText("A: Suite | B: MAP | C: 7,000")).toBeVisible();
  await expect(dialog.getByLabel("Season name")).toHaveValue("Winter 2030-31");
  await expect(dialog.getByRole("textbox", { name: "First day" })).toHaveValue("01/10/2030");
  await expectAccessible(page);
  await shoot(page, testInfo, "proposed-rates");

  // Nothing is saved yet, and Save is shut until each price has its own tick.
  const save = dialog.getByRole("button", { name: /^Save/ });
  await expect(save).toBeDisabled();
  expect(await inAgency(agency.organizationId, (tx) => tx.supplierRate.count())).toBe(0);
  await dialog.getByLabel("Cost to the agency").nth(1).fill("7,100");
  for (const item of ["Deluxe room", "Suite"])
    await dialog.getByRole("checkbox", { name: `I checked the price of ${item}` }).check();
  await expect(save).toBeDisabled();
  await expect(
    dialog
      .getByText("Tick each price you have checked: 1 left.")
      .or(dialog.getByText("Tick the price you have checked: 1 left.")),
  ).toBeVisible();
  await dialog.getByRole("checkbox", { name: "I checked the price of Cottage" }).check();
  await expect(save).toBeEnabled();
  await save.click();

  const rates = page.getByRole("region", { name: "Rates" });
  await expect(page.getByText("3 rates saved")).toBeVisible();
  await expect(rates.getByRole("heading", { level: 3, name: "Winter 2030-31" })).toBeVisible();
  await expect(rates).toContainText("₹4,500");
  await expect(rates).toContainText("₹7,100");
  await expect(rates).not.toContainText("₹7,000");

  // Audited as drafted by AI, approved by the member, with the price the member changed.
  const fill = await inAgency(agency.organizationId, (tx) =>
    tx.aiFill.findFirstOrThrow({ where: { target: "rate_sheet" } }),
  );
  expect(fill.appliedFields).toEqual(["r1", "r2", "r3"]);
  expect(fill.changedFields).toEqual(["r2"]);
  const entries = await inAgency(agency.organizationId, (tx) =>
    tx.auditEntry.findMany({ where: { action: "ai.fill-applied" } }),
  );
  expect(entries).toHaveLength(1);
});

test("a sheet too big for one read is offered by part, and each part read is another call", async ({
  page,
  agency,
}, testInfo) => {
  test.setTimeout(300_000);
  await signInByEmail(page, agency.owner);
  await turnOnAi(page);
  const supplierId = await aSupplier(page);
  const dialog = await openRateSheet(page, supplierId);
  const rows = Array.from({ length: 200 }, (_, index) => [`Room ${String(index + 1)}`, "MAP", String(1000 + index)]);
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "big-rates.xlsx",
    mimeType: XLSX,
    buffer: await xlsxOf([["Room", "Plan", "Rate"], ...rows]),
  });
  await dialog.getByRole("button", { name: "Read the sheet" }).click();

  // No call is used until a part is chosen.
  await expect(dialog.getByText(/The sheet has \d+ parts/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Read this part" })).toBeDisabled();
  expect(await inAgency(agency.organizationId, (tx) => tx.aiUsage.count())).toBe(0);
  await expect(dialog.getByRole("radio").first()).toBeVisible();
  await expectAccessible(page);
  await dialog.getByRole("radio").first().check();
  await dialog.getByRole("button", { name: "Read this part" }).click();
  await expect(dialog.getByText("3 rates found")).toBeVisible();
  await dialog
    .getByRole("checkbox", { name: /^I checked the price of/ })
    .first()
    .check();
  for (const box of await dialog.getByRole("checkbox", { name: /^I checked the price of/ }).all()) await box.check();
  await dialog.getByRole("button", { name: /^Save/ }).click();

  // The next part is offered; its rows go in the season the first part made.
  await expect(dialog.getByText("Part saved. Read the next part?")).toBeVisible();
  await expectAccessible(page);
  await shoot(page, testInfo, "read-the-next-part");
  await dialog.getByRole("radio").nth(1).check();
  await dialog.getByRole("button", { name: "Read this part" }).click();
  await expect(dialog.getByText("The supplier has this season already. These rates go in it.")).toBeVisible();
  for (const box of await dialog.getByRole("checkbox", { name: /^I checked the price of/ }).all()) await box.check();
  await dialog.getByRole("button", { name: /^Save/ }).click();
  await expect(dialog.getByText("2 parts saved. Read the next part?")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("region", { name: "Rates" }).getByRole("heading", { level: 3 })).toHaveCount(1);
  expect(await inAgency(agency.organizationId, (tx) => tx.supplierRate.count())).toBe(6);
  expect((await inAgency(agency.organizationId, (tx) => tx.aiUsage.findFirstOrThrow())).calls).toBe(2);
});
