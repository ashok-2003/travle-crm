// What the staff import's journeys and camera share: a team's file as a manager would save it, the walk from the Staff
// screen to the preview, and reading the passwords the done screen shows once.
import { expect, type Page } from "@playwright/test";
import { chooseImportFile, csvOf, waitForImportStatus } from "./imports";

/**
 * Five people with roles, the first row naming the columns as a team's sheet would. An email belongs to one account in
 * the whole product, and the journeys share a database, so the agency's code is in each address.
 */
export const teamRows = (code: string): string[][] => [
  ["Name", "Username", "Email", "Phone", "Role"],
  ["Kavita Rao", "kavita", `kavita.rao.${code.toLowerCase()}@example.test`, "98765 43210", "Sales"],
  ["Imran Qureshi", "imran", "", "98330 41275", "Sales"],
  ["Deepak Nair", "", `deepak.nair.${code.toLowerCase()}@example.test`, "", "Operations"],
  ["Lakshmi Iyer", "lakshmi", "", "", "Accounts"],
  ["Arvind Menon", "arvind", "", "", "Sales"],
];

/** Staff → Import → the file chosen → the columns as guessed → Check the rows: the preview, waiting for Add. */
export async function walkToPreview(page: Page, rows: string[][]): Promise<string> {
  await page.goto("/staff");
  await page.getByRole("link", { name: "Import" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Import staff" })).toBeVisible();
  await chooseImportFile(page, { name: "staff-list.csv", mimeType: "text/csv", buffer: csvOf(rows) });
  await waitForImportStatus(page, /Match your columns/);
  await page.getByRole("button", { name: "Check the rows" }).click();
  await waitForImportStatus(page, /Will be added/);
  return /\/staff\/import\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? "";
}

/** The temporary passwords the done screen shows, by the order of its rows. */
export async function shownPasswords(page: Page): Promise<string[]> {
  const found = await page.getByRole("main").locator(".numbers").allTextContents();
  return found.filter((text) => /^[a-km-zA-HJ-NP-Z2-9]{12}$/.test(text));
}
