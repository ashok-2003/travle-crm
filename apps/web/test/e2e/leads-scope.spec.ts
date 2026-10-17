// Who sees which leads (spec 2, 4, R26): a salesperson sees only their own, whatever the address asks for (Everyone,
// with the Owner as the owner filter) and whatever the api is asked directly, and another's lead is "not found", never
// a hint that it exists.
import { expect, signInByCode, signInByEmail, test } from "./support/fixtures";
import { addLeadThroughApi, callApi, leadInput, leadWorkerAgency } from "./support/leads";

interface ListedPage {
  items: { person: { name: string }; ownerUserId: string | null }[];
}

test("a salesperson sees only their own leads, and another's lead is not found", async ({ page, agency, addStaff }) => {
  await signInByEmail(page, agency.owner);
  const { owner, ravi } = await leadWorkerAgency(page, { agency, addStaff });
  const ashas = await addLeadThroughApi(page, leadInput({ person: { name: "Sneha Iyer", phone: "+919845011234" } }));
  await addLeadThroughApi(page, leadInput({ ownerUserId: ravi.userId }));

  await page.context().clearCookies();
  await signInByCode(page, { code: agency.code, staff: ravi });

  // The api itself keeps him to his own, asked for everyone's or for the Owner's.
  for (const input of [{ view: "everyone" }, { view: "everyone", ownerUserId: owner.userId }]) {
    const listed = await callApi<ListedPage>(page, "leads.list", input);
    expect(listed.items.map((item) => item.person.name)).toEqual(["Rahul Sharma"]);
    expect(listed.items.every((item) => item.ownerUserId === ravi.userId)).toBe(true);
  }

  await page.goto(`/leads?view=everyone&owner=${owner.userId}`);
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: /Rahul Sharma/ })).toBeVisible();
  await expect(main.getByText("Sneha Iyer")).toHaveCount(0);
  await expect(page.getByRole("tablist")).toHaveCount(0);

  await page.goto(`/leads/${ashas}`);
  await expect(page.getByText("There's no lead here. It may have been removed.")).toBeVisible();
  await expect(main.getByText("Sneha Iyer")).toHaveCount(0);
  await expect(main.getByRole("link", { name: "Leads", exact: true })).toBeVisible();
});
