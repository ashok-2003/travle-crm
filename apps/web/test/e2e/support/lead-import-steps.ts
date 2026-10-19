// The lead import's steps as a person takes them, for its journeys and its camera: choosing a file on the import page,
// matching the columns as guessed, and the preview's Add, each waiting for the worker to move the import on (the
// screen follows it every 2 seconds).
import { expect, type Download, type Page } from "@playwright/test";
import { createSpreadsheets, type ReadSheet } from "@travel-crm/integrations/spreadsheets";
import { chooseImportFile, csvOf } from "./imports";

/** How long the worker may take over one step of a journey's file on a loaded machine. */
export const WORKER_STEP_MS = 90_000;

export const CSV_TYPE = "text/csv";

/** The import's address, the file chosen, and the import waiting at its columns. */
export async function startLeadImport(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  await page.goto("/leads/import");
  await expect(page.getByRole("heading", { level: 1, name: "Import leads" })).toBeVisible();
  await chooseImportFile(page, file);
  await expect(page.getByRole("heading", { level: 1, name: "Match columns" })).toBeVisible({
    timeout: WORKER_STEP_MS,
  });
}

/** Check the rows with the columns as guessed, and the preview open. */
export async function checkTheRows(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Check the rows" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Check before adding" })).toBeVisible({
    timeout: WORKER_STEP_MS,
  });
  await expect(page.getByRole("button", { name: /^Add \d[\d,]* rows?$/ })).toBeVisible({ timeout: WORKER_STEP_MS });
}

/** Add, once the preview asks: the confirmation answered, and the import done (or stopped). */
export async function addAndWait(page: Page, ends = /^Import done$/): Promise<void> {
  await page.getByRole("button", { name: /^Add \d[\d,]* rows?$/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Add the rows" }).click();
  await expect(page.getByRole("heading", { level: 1, name: ends })).toBeVisible({ timeout: WORKER_STEP_MS });
}

/** A whole import: choose, match as guessed, check, add. */
export async function importAsGuessed(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  await startLeadImport(page, file);
  await checkTheRows(page);
  await addAndWait(page);
}

/** The count beside a label on the done screen ("New leads" 20), as a person reads it. */
export function countOf(page: Page, label: string) {
  return page.getByRole("listitem").filter({ hasText: label });
}

/** A CSV file as the journeys pick it. */
export function csvFile(name: string, rows: string[][]): { name: string; mimeType: string; buffer: Buffer } {
  return { name, mimeType: CSV_TYPE, buffer: csvOf(rows) };
}

/** The report of rows not added, as the browser downloaded it, read as the product reads any .xlsx. */
export async function readDownload(download: Download): Promise<ReadSheet> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return createSpreadsheets().read(Buffer.concat(chunks), {
    kind: download.suggestedFilename().endsWith(".csv") ? "csv" : "xlsx",
    maxRows: 20_000,
    maxColumns: 50,
    maxCellLength: 4000,
  });
}
