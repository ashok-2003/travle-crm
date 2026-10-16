// Who sees which leads (spec 2, 4, R26): a salesperson sees only their own, whatever the address asks for (Everyone,
// another's owner filter), and another's lead is "not found", never a hint that it exists.
import { expect, signInByCode, signInByEmail, test } from "./support/fixtures";
import { addLeadThroughApi, leadInput, leadWorkerAgency } from "./support/leads";

test("a salesperson sees only their own leads, and another's lead is not found", async ({ page, agency, addStaff }) => {
  await signInByEmail(page, agency.owner);
  const { ravi } = await leadWorkerAgency(page, { agency, addStaff });
  const ashas = await addLeadThroughApi(page, leadInput({ person: { name: "Sneha Iyer", phone: "+919845011234" } }));
  await addLeadThroughApi(page, leadInput({ ownerUserId: ravi.userId }));

  await page.context().clearCookies();
  await signInByCode(page, { code: agency.code, staff: ravi });
  await page.goto(`/leads?view=everyone&owner=${ravi.userId}`);
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: /Rahul Sharma/ })).toBeVisible();
  await expect(main.getByText("Sneha Iyer")).toHaveCount(0);
  await expect(page.getByRole("tablist")).toHaveCount(0);

  await page.goto(`/leads/${ashas}`);
  await expect(page.getByText("There's no lead here. It may have been removed.")).toBeVisible();
  await expect(main.getByText("Sneha Iyer")).toHaveCount(0);
  await expect(main.getByRole("link", { name: "Leads", exact: true })).toBeVisible();
});
