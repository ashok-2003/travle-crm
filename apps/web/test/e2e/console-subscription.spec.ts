// An organization's subscription in the console (spec 7.3, 7.4): a past-due agency is active again once support
// records its payment; and a suspension made by hand shows in the console while the agency's own calls are refused.
import { addDays, calendarDateIn } from "@travel-crm/domain/kernel";
import { expect, signInToConsole, test } from "./support/console";
import { signInByEmail } from "./support/fixtures";

const DAY_MS = 24 * 60 * 60 * 1000;

test("a past-due agency becomes active when support records a payment", async ({ page, support, agency, database }) => {
  // Paid through three days ago: past due today, by the lifecycle's own reckoning.
  await database.platform.subscription.update({
    where: { organizationId: agency.organizationId },
    data: { paidThrough: new Date(Date.now() - 3 * DAY_MS) },
  });
  await signInToConsole(page, support);
  await page.goto(`/console/organizations/${agency.organizationId}`);
  const subscription = page.getByRole("region", { name: "Subscription" });
  await expect(subscription.getByText("Payment due")).toBeVisible();

  await subscription.getByRole("button", { name: "Record a payment" }).click();
  const dialog = page.getByRole("dialog", { name: "Record a payment" });
  await dialog.getByLabel("Amount received").fill("2950");
  await dialog.getByLabel("Pays through").fill(addDays(calendarDateIn(new Date(), "Asia/Kolkata"), 30));
  await dialog.getByLabel("Reference").fill("NEFT UTR 412345678901");
  await dialog.getByRole("button", { name: "Record the payment" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(subscription.getByText("Active", { exact: true })).toBeVisible();
  await expect(subscription.getByText("₹2,950", { exact: true })).toBeVisible();
  await expect(subscription.getByText("NEFT UTR 412345678901")).toBeVisible();
});

test("a suspension shows in the console, and the agency's calls are refused", async ({ page, support, agency }) => {
  await signInToConsole(page, support);
  await page.goto(`/console/organizations/${agency.organizationId}`);
  const subscription = page.getByRole("region", { name: "Subscription" });
  await subscription.getByRole("button", { name: "Suspend", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Suspend this organization?" });
  await dialog.getByLabel("Reason").fill("Chargeback on the last payment");
  await dialog.getByRole("button", { name: "Suspend" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(subscription.getByText("Suspended", { exact: true })).toBeVisible();
  await expect(subscription.getByText(/Chargeback on the last payment/)).toBeVisible();

  // The Owner, in a browser of their own: the agency's api refuses what a suspended organization can't do.
  await page.context().clearCookies();
  await signInByEmail(page, agency.owner);
  const refused = await page.request.get("/api/trpc/roles.list");
  expect(refused.status()).toBe(403);
  expect(await refused.json()).toMatchObject({ error: { data: { reason: "ORGANIZATION_SUSPENDED" } } });
});
