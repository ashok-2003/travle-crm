// What the import journeys and the camera start from: a file as a person picks it through Choose a file, a CSV or an
// .xlsx of the rows a journey names (the .xlsx written by the product's own writer, so it is a real workbook), and
// waiting for the worker to move an import on, which its screen shows by polling every 2 seconds.
import { expect, type Page } from "@playwright/test";
import { createSpreadsheets } from "@travel-crm/integrations/spreadsheets";

/** How long the worker may take to read, check or add a journey's file on a loaded machine. */
const WORKER_STEP_MS = 60_000;

/** Picks the file through the import's Choose a file button, as a person picks it from their files. */
export async function chooseImportFile(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose a file" }).click();
  await (await chooser).setFiles(file);
}

/** A CSV of the rows, the first naming the columns: quoted where a cell needs it, lines ending CRLF, as Excel saves. */
export function csvOf(rows: string[][]): Buffer {
  const cell = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);
  return Buffer.from(rows.map((row) => `${row.map(cell).join(",")}\r\n`).join(""), "utf8");
}

/** An .xlsx of the rows, the first naming the columns: numbers as number cells, everything else as text. */
export async function xlsxOf(rows: (string | number | null)[][]): Promise<Buffer> {
  const [header = [], ...body] = rows;
  const writer = createSpreadsheets().writer({
    kind: "xlsx",
    sheetName: "Sheet1",
    columns: header.map((name) => ({ header: String(name ?? ""), kind: "text" })),
  });
  writer.write(body);
  return Buffer.from(await writer.finish());
}

/** Waits until the import's screen shows these words (its status, or its step's heading) as the worker moves it on. */
export async function waitForImportStatus(page: Page, words: RegExp): Promise<void> {
  await expect(page.getByRole("main").getByText(words).first()).toBeVisible({ timeout: WORKER_STEP_MS });
}
