// The console's failed emails (the failed-emails spec): an email the provider took and then dropped, as Brevo's
// webhook reports it, shows on a super admin's Failed emails; it opens as it was sent, in a sandboxed frame the page's
// policy lets render, and Send again delivers it, the outcome on the page, the resend in its list and on the list's
// row. Failed emails are the whole platform's, so the journey finds its own by its super admin's unique address.
import type { StoredEmail } from "@travel-crm/contracts/platform";
import { expectAccessible } from "./support/accessibility";
import { brevoReportsDropped, emailsTo, referenceOfEmailTo } from "./support/brevo";
import { expect, test } from "./support/console";
import { consoleCall, openConsoleScreen, recordWith } from "./support/console-platform";

test("a super admin opens an email Brevo dropped, and sends it again", async ({ page, superAdmin }, testInfo) => {
  // The super admin's own reset email, sent through the api's recorded sender to Mailpit.
  const asked = await page.request.post("/api/auth/request-password-reset", {
    data: { email: superAdmin.email, redirectTo: `${process.env.E2E_BASE_URL ?? ""}/reset-password` },
    headers: { origin: process.env.E2E_BASE_URL ?? "" },
  });
  expect(asked.ok()).toBe(true);
  const reference = await referenceOfEmailTo(superAdmin.email);
  expect(await brevoReportsDropped(reference, superAdmin.email, "Reset your password")).toBe(200);

  await openConsoleScreen(page, superAdmin, "/console", "Dashboard");
  // The worker processes Brevo's report in the background.
  await expect
    .poll(async () => ((await consoleCall(page, "emails.get", { id: reference })) as StoredEmail).status)
    .toBe("failed");
  await page.goto("/console/emails");
  const record = recordWith(page, testInfo, superAdmin.email);
  await expect(record).toContainText("Dropped by the email provider");
  await expect(record).toContainText("blocked");
  await record.getByRole("link").first().click();

  await expect(page.getByRole("heading", { level: 1, name: "Reset your password" })).toBeVisible();
  const details = page.getByRole("region", { name: "How it was sent" });
  await expect(details).toContainText(superAdmin.email);
  await expect(details).toContainText("Account under review");
  // The email as sent renders inside the sandboxed frame, the console's Content-Security-Policy notwithstanding.
  const frame = page.frameLocator('iframe[title^="The email as it was sent"]');
  await expect(frame.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await expect(frame.getByRole("link", { name: "Choose a new password" })).toBeVisible();
  // The page around the email; the email's own HTML, in its sandbox, can't take axe's script.
  await expectAccessible(page, { exclude: ["iframe"] });

  await page.getByRole("button", { name: "Send again" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Send again" }).click();
  await expect(page.getByText("Sent again. If it doesn't arrive")).toBeVisible();
  await expect(page.getByRole("region", { name: "Sent again" }).getByText("Sent", { exact: true })).toBeVisible();
  await expect.poll(async () => (await emailsTo(superAdmin.email)).length).toBe(2);

  await page.getByRole("link", { name: "Back to the failed emails" }).click();
  await expect(recordWith(page, testInfo, superAdmin.email)).toContainText("Sent again");
});
