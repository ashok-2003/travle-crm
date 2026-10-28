// The visual audit's agency screens: an Owner sets their agency up screen by screen (Home's setup card, the checklist,
// settings, the business profile and files, branding with a logo and the sample, documents and a share link, roles,
// staff), a customer opens the link and the bell says so, then the notification choices, the audit log and the shell's
// bars; and a Sales member's home, a screen their role can't open, and the console opened by an agency's Owner.
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import { logoPng, saveBusinessProfile } from "../support/documents";
import { expect, homeGreeting, signInByCode, signInByEmail, test } from "../support/fixtures";
import { screenshotsOnly, shoot } from "./camera";

test.beforeEach(screenshotsOnly);

const PDF = Buffer.from("%PDF-1.4\n% A scanned certificate, as far as storage can tell.\n");

/** The app's own large icon stands in for the agency's logo: the journeys' 1x1 PNG shows nothing to judge. */
const logoFile = path.resolve(import.meta.dirname, "../../../public/icons/icon-512.png");

/**
 * Runs in the page before the app: notifications not yet asked for, and no subscription. A headless browser reports
 * notifications denied, which shows the push card's rarer "blocked" state instead of its usual one.
 */
function pushNotYetAsked(): void {
  Object.defineProperty(Notification, "permission", { configurable: true, get: () => "default" });
  PushManager.prototype.getSubscription = () => Promise.resolve(null);
}

/** Uploads a PDF as a person picks it from their files, choosing first whether it is sensitive. */
async function uploadPdf(page: Page, name: string, sensitivity: "Sensitive" | "Not sensitive"): Promise<void> {
  await page.getByRole("radio", { name: sensitivity, exact: true }).check();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload a file" }).click();
  await (await chooser).setFiles({ name, mimeType: "application/pdf", buffer: PDF });
  await expect(page.getByRole("main").getByRole("listitem").filter({ hasText: name })).toBeVisible();
}

test("an Owner's agency, screen by screen, as it is set up", async ({ page, request, agency, addStaff }, testInfo) => {
  await addStaff({ name: "Ravi Kumar", username: "ravi", roleKey: "sales" });
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  await page.goto("/dashboard");
  const checklist = page.getByRole("region", { name: `Finish setting up ${agency.name}` });
  await expect(checklist.getByText("5 of 7 done")).toBeVisible();
  await shoot(page, "home-checklist");
  await page.goto("/setup");
  await expect(page.getByRole("heading", { level: 1, name: "Set up your organization" })).toBeVisible();
  await expect(page.getByText("5 of 7 done")).toBeVisible();
  await shoot(page, "setup");

  await page.goto("/settings");
  await expect(page.getByText(agency.code, { exact: true })).toBeVisible();
  await shoot(page, "settings");
  await page.goto("/settings/profile");
  await expect(page.getByLabel("Account number", { exact: true })).toHaveValue("XXXX7890");
  await shoot(page, "business-profile");
  await page.goto("/settings/files");
  await expect(page.getByRole("heading", { level: 1, name: "Business files" })).toBeVisible();
  await uploadPdf(page, "GST certificate.pdf", "Not sensitive");
  await uploadPdf(page, "Owner's PAN card.pdf", "Sensitive");
  await shoot(page, "business-files");

  await page.goto("/settings/branding");
  await expect(page.getByText("No logo yet.")).toBeVisible();
  await page.getByLabel("Logo image").setInputFiles({ ...logoPng, buffer: await readFile(logoFile) });
  const logo = page.getByRole("img", { name: "Your logo" });
  await expect.poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole("textbox", { name: "Brand colour", exact: true }).fill("#1f6f5c");
  await page.getByRole("textbox", { name: "Terms" }).fill("50% to book, the balance 30 days before travel.");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Branding saved")).toBeVisible();
  await page.getByRole("button", { name: "Preview on a sample quotation" }).click();
  // The worker renders the sample in the background; the screen asks again until it has.
  await expect(page.getByText(/^SMPL-\d{4}-0001 is ready/)).toBeVisible({ timeout: 30_000 });
  await shoot(page, "branding");

  await page.goto("/settings/documents");
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
  await shoot(page, "documents");
  await page.getByRole("button", { name: /^Share SMPL-/ }).click();
  const share = page.getByRole("dialog", { name: /^Share SMPL-/ });
  await share.getByRole("textbox", { name: "Label" }).fill("For Meera Iyer");
  await share.getByRole("button", { name: "Create link" }).click();
  const link = share.getByRole("textbox", { name: "The link" });
  await expect(link).toHaveValue(/\/p\/[A-Za-z0-9_-]{65}$/);
  await shoot(page, "documents-share-dialog");
  // A customer, signed in nowhere, opens it: the worker tells the Owner's bell.
  expect((await request.get(await link.inputValue(), { maxRedirects: 0 })).status()).toBe(302);
  await page.keyboard.press("Escape");
  await expect(share).toHaveCount(0);

  await page.goto("/roles");
  await expect(page.getByRole("link", { name: /^Sales/ })).toBeVisible();
  await shoot(page, "roles");
  await page.getByRole("button", { name: "New role" }).click();
  const newRole = page.getByRole("dialog", { name: "New role" });
  await expect(newRole).toBeVisible();
  await shoot(page, "roles-new-dialog");
  await page.keyboard.press("Escape");
  await expect(newRole).toHaveCount(0);
  await page.goto("/roles/sales");
  await expect(page.getByRole("checkbox", { name: "See the audit log" })).toBeVisible();
  await shoot(page, "role-editor");
  // A change for the audit log to show.
  await page.getByRole("checkbox", { name: "See the audit log" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Sales was saved")).toBeVisible();

  await page.goto("/staff");
  await expect(page.getByRole("main").getByText("Ravi Kumar")).toBeVisible();
  await shoot(page, "staff");
  await page.getByRole("button", { name: "Add staff" }).click();
  const form = page.getByRole("dialog", { name: "Add staff" });
  await form.getByLabel("Full name").fill("Meera Iyer");
  await form.getByLabel("Username").fill("meera");
  await shoot(page, "staff-add-dialog");
  await form.getByRole("button", { name: "Add", exact: true }).click();
  const handover = page.getByRole("dialog", { name: "Meera Iyer was added" });
  await expect(handover.getByText(agency.code, { exact: true })).toBeVisible();
  await shoot(page, "staff-added-dialog");
  await handover.getByRole("button", { name: "Done" }).click();
  await expect(handover).toHaveCount(0);

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: homeGreeting(agency.owner.name) })).toBeVisible();
  // The checklist asks again as the screen opens; only its answer says it is gone for good.
  await page.waitForLoadState("networkidle");
  await expect(checklist).toHaveCount(0);
  await shoot(page, "home-done");

  // The worker's notice of the open may still be on its way.
  const bell = page.getByRole("button", { name: /^Notifications/ }).filter({ visible: true });
  await expect(async () => {
    await page.reload();
    await expect(bell).toHaveAccessibleName(/unread$/, { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await bell.click();
  await expect(page.getByRole("dialog", { name: "Notifications" }).getByText("Opened: For Meera Iyer")).toBeVisible();
  await shoot(page, "notifications-bell");
  await page.keyboard.press("Escape");

  await page.addInitScript(pushNotYetAsked);
  await page.goto("/account/notifications");
  await expect(
    page.getByRole("region", { name: "On this device" }).getByRole("button", { name: "Turn on push" }),
  ).toBeVisible();
  await shoot(page, "notification-preferences");

  await page.goto("/settings/audit");
  const change = page
    .getByRole("list", { name: "Changes" })
    .getByRole("listitem")
    .filter({ hasText: "Changed a role" });
  // The entry's title opens what changed, in words.
  await change.getByRole("button", { name: /see what changed/ }).click();
  await expect(change.getByText("See the audit log", { exact: true })).toBeVisible();
  await shoot(page, "audit-log");

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: homeGreeting(agency.owner.name) })).toBeVisible();
  if (testInfo.project.name === "phone") {
    await shoot(page, "top-bar", { element: page.locator("header").filter({ visible: true }).first() });
    const bottomBar = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
    await shoot(page, "bottom-bar", { element: bottomBar });
    await bottomBar.getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("dialog", { name: agency.name })).toBeVisible();
    await shoot(page, "more-sheet");
  } else {
    await shoot(page, "sidebar", { element: page.locator("[data-slot=sidebar-container]") });
  }
});

test("a Sales member's home and a screen their role can't open; the console, opened by the Owner", async ({
  page,
  agency,
  addStaff,
}) => {
  const ravi = await addStaff({ name: "Ravi Kumar", username: "ravi", roleKey: "sales" });
  await signInByCode(page, { code: agency.code, staff: ravi });
  await page.goto("/dashboard");
  await expect(page.getByText("Your work will show here.")).toBeVisible();
  await shoot(page, "sales-home");
  await page.goto("/staff");
  await expect(page.getByText("Your role doesn't include this screen.", { exact: false })).toBeVisible();
  await shoot(page, "sales-not-allowed");

  await page.context().clearCookies();
  await signInByEmail(page, agency.owner);
  await page.goto("/console");
  await expect(page.getByText("This console is for platform staff.")).toBeVisible();
  await shoot(page, "console-not-for-agency");
});
