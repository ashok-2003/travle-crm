// The Google Sheets sync's steps as a person takes them, for its journeys and its camera: a Google Form's responses sheet
// in the fake Google, connecting it (share, paste, match as guessed, choose what to do with the rows there), pressing
// Sync now, and waiting for a lead to show. The fake is the journeys' own (support/fake-google.ts); the real api and
// worker run their real adapter against it, with a one-second check interval.
import { expect, type Page } from "@playwright/test";
import { fakeGoogleClient, type FakeGoogleClient } from "./fake-google";
import { WORKER_STEP_MS } from "./lead-import-steps";

export const FORM_TAB = "Form responses 1";
export const FORM_HEADER = ["Timestamp", "Full name", "Phone number", "Email Address"];

/** The fake Google the run started (E2E_GOOGLE_URL), as a journey's own process reaches it. */
export function fakeGoogle(): FakeGoogleClient {
  const url = process.env.E2E_GOOGLE_URL;
  if (!url) throw new Error("E2E_GOOGLE_URL is not set: run the journeys with `pnpm --filter @travel-crm/web e2e`");
  return fakeGoogleClient(url);
}

let counter = 0;

/** A spreadsheet id of the shape Google's are, new for each call. */
function newSpreadsheetId(): string {
  counter += 1;
  return `1${Date.now().toString(36)}${String(counter).padStart(3, "0")}${Math.random().toString(36).slice(2, 14)}-x_`.padEnd(
    44,
    "q",
  );
}

export const linkTo = (id: string, gid = "0") =>
  `https://docs.google.com/spreadsheets/d/${id}/edit?gid=${gid}#gid=${gid}`;

/** A row a Google Form adds: a timestamp, the answers. */
export const answer = (name: string, phone: string, extra: string[] = [], email = ""): string[] => [
  "19/10/2026 14:00:00",
  name,
  phone,
  email,
  ...extra,
];

export interface GoogleForm {
  id: string;
  link: string;
  title: string;
}

/** A Google Form's responses sheet in the fake Google, shared with the product's address unless told not. */
export async function aGoogleForm(
  google: FakeGoogleClient,
  options: { title?: string; rows?: string[][]; header?: string[]; shared?: boolean; tab?: string } = {},
): Promise<GoogleForm> {
  const id = newSpreadsheetId();
  const title = options.title ?? "Goa Diwali campaign (Responses)";
  await google.addSpreadsheet({
    id,
    title,
    tabs: [
      { gid: "0", title: options.tab ?? FORM_TAB, rows: [options.header ?? FORM_HEADER, ...(options.rows ?? [])] },
    ],
  });
  if (options.shared !== false) await google.share(id);
  return { id, link: linkTo(id), title };
}

/** The first step: the link pasted and the sheet checked, ending on the columns step. */
export async function pasteSheetLink(page: Page, link: string): Promise<void> {
  await page.goto("/settings/lead-sources/sheets/connect");
  await expect(page.getByRole("heading", { level: 1, name: "Connect a sheet" })).toBeVisible();
  await page.getByRole("textbox", { name: "Sheet link" }).fill(link);
  await page.getByRole("button", { name: "Check the sheet" }).click();
}

/**
 * Connects a sheet as guessed: share, paste, Next on the columns, the choice for the rows already there, Connect. Ends on
 * the sheet's page for "only new rows", or the import's preview for "check".
 */
export async function connectSheet(
  page: Page,
  options: { link: string; existing: "only_new" | "check" },
): Promise<void> {
  await pasteSheetLink(page, options.link);
  await expect(page.getByRole("heading", { level: 1, name: "Match columns" })).toBeVisible({ timeout: WORKER_STEP_MS });
  await page.getByRole("button", { name: "Next" }).click();
  const hasRows = await page
    .getByRole("heading", { level: 1, name: "Rows already in the sheet" })
    .waitFor({ timeout: 10_000 })
    .then(
      () => true,
      () => false,
    );
  if (hasRows) {
    if (options.existing === "check") await page.getByRole("radio", { name: /^Also check the/ }).check();
    await page.getByRole("button", { name: "Connect the sheet" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Connect", exact: true }).click();
  }
  if (options.existing === "check") {
    await expect(page.getByRole("heading", { level: 1, name: "Check before adding" })).toBeVisible({
      timeout: WORKER_STEP_MS,
    });
  } else {
    await expect(page.getByText(/^Tab ‘/)).toBeVisible({ timeout: WORKER_STEP_MS });
  }
}

/** Sync now on the sheet's page: pressed, and the check done (the button is back and the page says when). */
export async function syncNow(page: Page): Promise<void> {
  const button = page.getByRole("button", { name: "Sync now" });
  await expect(button).toBeEnabled({ timeout: WORKER_STEP_MS });
  await button.click();
  await expect(page.getByRole("button", { name: "Checking…" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sync now" })).toBeVisible({ timeout: WORKER_STEP_MS });
}

/** A lead of this name, in Leads (everyone's), once the sync has added it. */
export async function waitForLead(page: Page, name: string): Promise<void> {
  await expect(async () => {
    await page.goto("/leads?view=everyone&source=google_sheet");
    await expect(
      page
        .getByRole("main")
        .getByRole("link", { name: new RegExp(name) })
        .first(),
    ).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: WORKER_STEP_MS });
}
