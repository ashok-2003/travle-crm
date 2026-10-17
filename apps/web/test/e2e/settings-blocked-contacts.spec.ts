// Blocking and unblocking (spec 3.4, 3.6, R33): an Owner blocks a lead's number from the lead's ⋯ menu, after asking;
// Settings' Blocked contacts lists it as +91 98765 43210, blocked by her today; Unblock, after asking, takes it off the
// list. axe checks the list and the Unblock question.
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { addLeadThroughApi, leadInput } from "./support/leads";
import { animationsSettled } from "./support/settled";

test("a number blocked from a lead is unblocked in Settings", async ({ page, agency }) => {
  await signInByEmail(page, agency.owner);
  const leadId = await addLeadThroughApi(page, leadInput());

  await page.goto(`/leads/${leadId}`);
  await page.getByRole("button", { name: "More for Rahul Sharma" }).click();
  await page.getByRole("menuitem", { name: "Block this number" }).click();
  const blocking = page.getByRole("alertdialog", { name: "Block Rahul Sharma's contact?" });
  await blocking.getByRole("button", { name: "Block" }).click();
  await expect(page.getByText("Blocked, and marked Not a lead")).toBeVisible();

  await page.goto("/settings");
  await page.getByRole("link", { name: /^Blocked contacts/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Blocked contacts" })).toBeVisible();
  const list = page.getByRole("list", { name: "Blocked contacts" });
  const row = list.getByRole("listitem");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("+91 98765 43210");
  await expect(row).toContainText("Blocked by Asha Sharma");
  await animationsSettled(page);
  await expectAccessible(page);

  await row.getByRole("button", { name: "Unblock +91 98765 43210" }).click();
  const asking = page.getByRole("alertdialog", { name: "Unblock +91 98765 43210?" });
  await animationsSettled(page);
  await expectAccessible(page);
  await asking.getByRole("button", { name: "Unblock" }).click();
  await expect(page.getByText("Unblocked")).toBeVisible();
  await expect(asking).toBeHidden();
  await expect(page.getByText("Nothing is blocked. A contact blocked from a lead shows here.")).toBeVisible();
});
