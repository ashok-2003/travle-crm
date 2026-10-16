// The visual audit's subscription states (spec 7.3), each on an agency of its own: the banner of a trial in its last
// week, of a payment due and of read-only, and the locked screens of a suspended agency, as a member and as its
// Owner, and of a cancelled one.
import { addDays, calendarDateIn } from "@travel-crm/domain/kernel";
import { expect, signInByCode, signInByEmail, test } from "../support/fixtures";
import { setSubscriptionState } from "../support/subscription-states";
import { screenshotsOnly, shoot } from "./camera";

test.beforeEach(screenshotsOnly);

test("a trial in its last week", async ({ page, agency, database }) => {
  const lastDay = addDays(calendarDateIn(new Date(), "Asia/Kolkata"), 3);
  await database.platform.subscription.update({
    where: { organizationId: agency.organizationId },
    data: { status: "trial", trialEndsOn: new Date(`${lastDay}T00:00:00Z`), paidThrough: null },
  });
  await signInByEmail(page, agency.owner);
  await page.goto("/");
  await expect(page.getByText(/^Trial ends /)).toBeVisible();
  await shoot(page, "banner-trial-ending");
});

test("a payment due", async ({ page, agency, database }) => {
  await setSubscriptionState(database.platform, agency.organizationId, "past_due");
  await signInByEmail(page, agency.owner);
  await page.goto("/");
  await expect(page.getByText(/^Payment due/)).toBeVisible();
  await shoot(page, "banner-payment-due");
});

test("read-only", async ({ page, agency, database }) => {
  await setSubscriptionState(database.platform, agency.organizationId, "read_only");
  await signInByEmail(page, agency.owner);
  await page.goto("/staff");
  await expect(page.getByText("Read-only until paid: you can view and export")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add staff" })).toBeDisabled();
  await shoot(page, "banner-read-only");
});

test("suspended, as a member and as the Owner", async ({ page, agency, addStaff, database }) => {
  const ravi = await addStaff({ name: "Ravi Kumar", username: "ravi", roleKey: "sales" });
  await setSubscriptionState(database.platform, agency.organizationId, "suspended");
  await signInByCode(page, { code: agency.code, staff: ravi });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Your organization is suspended" })).toBeVisible();
  await shoot(page, "suspended-member");

  await page.context().clearCookies();
  await signInByEmail(page, agency.owner);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Go to Staff" })).toBeVisible();
  await shoot(page, "suspended-owner");
});

test("cancelled", async ({ page, agency, addStaff, database }) => {
  const kiran = await addStaff({ name: "Kiran Rao", username: "kiran", roleKey: "org-admin" });
  await setSubscriptionState(database.platform, agency.organizationId, "cancelled");
  await signInByCode(page, { code: agency.code, staff: kiran });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Your organization's subscription has ended" }),
  ).toBeVisible();
  await shoot(page, "cancelled");
});
