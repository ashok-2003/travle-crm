// Home's nudge (spec 3.1, R35): with two follow-ups overdue, a new lead waiting and a follow-up due later today, Home
// says "4 things today" with "2 overdue" and shows three of them, never more: the first overdue, the new lead, the
// one due today, each leading to its lead; the second overdue waits in Today. Open Today opens Today with all four.
// New lead is the header's action. axe checks Home.
import { expect, signInByEmail, test } from "./support/fixtures";
import { addFollowUpThroughApi, addLeadThroughApi, leadInput, moveStageThroughApi } from "./support/leads";
import { addOverdueFollowUp, laterToday } from "./support/work";

test("Home shows the count and three things, and Open Today opens Today", async ({ page, agency }) => {
  await signInByEmail(page, agency.owner);
  const sneha = await addLeadThroughApi(page, leadInput({ person: { name: "Sneha Iyer", phone: "+919845011234" } }));
  await moveStageThroughApi(page, sneha, "contacted");
  await addOverdueFollowUp(page, sneha, "Send the Goa options");
  const vikram = await addLeadThroughApi(page, leadInput({ person: { name: "Vikram Singh", phone: "+919928044120" } }));
  await moveStageThroughApi(page, vikram, "contacted");
  await addOverdueFollowUp(page, vikram, "Send the revised Rajasthan quote");
  const priya = await addLeadThroughApi(page, leadInput({ person: { name: "Priya Nair", phone: "+919847031905" } }));
  await moveStageThroughApi(page, priya, "contacted");
  await addFollowUpThroughApi(page, priya, {
    title: "Confirm the Kedarnath dates",
    ...(await laterToday(page, 120)),
  });
  const rahul = await addLeadThroughApi(page, leadInput());

  await page.goto("/");
  const nudge = page.getByRole("region", { name: /things today/ });
  await expect(nudge.getByRole("heading", { level: 2 })).toContainText("4 things today");
  await expect(nudge.getByText("2 overdue", { exact: true })).toBeVisible();
  // Three things, in order: the first overdue, the new lead waiting, the one due today.
  const things = nudge.getByRole("listitem");
  await expect(things).toHaveCount(3);
  await expect(things.nth(0).getByRole("link")).toHaveAttribute("href", `/leads/${sneha}`);
  await expect(things.nth(0).getByText("Send the Goa options", { exact: true })).toBeVisible();
  await expect(things.nth(0).getByText("Overdue", { exact: true })).toBeVisible();
  await expect(things.nth(1).getByRole("link")).toHaveAttribute("href", `/leads/${rahul}`);
  await expect(things.nth(1).getByText("New lead, no reply yet", { exact: true })).toBeVisible();
  await expect(things.nth(2).getByRole("link")).toHaveAttribute("href", `/leads/${priya}`);
  await expect(things.nth(2).getByText("Confirm the Kedarnath dates", { exact: true })).toBeVisible();
  // The second overdue isn't among them.
  await expect(nudge.getByText("Vikram Singh")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "New lead", exact: true })).toHaveAttribute("href", "/leads/new");

  await nudge.getByRole("link", { name: "Open Today" }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
  const overdue = page.getByRole("region", { name: "Overdue" });
  await expect(overdue.getByRole("link", { name: "Sneha Iyer", exact: true })).toBeVisible();
  await expect(overdue.getByRole("link", { name: "Vikram Singh", exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Due today" }).getByRole("link", { name: "Priya Nair", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "New leads waiting for a reply" })
      .getByRole("link", { name: "Rahul Sharma", exact: true }),
  ).toBeVisible();
  await page.goto("/");
  await expect(nudge).toBeVisible();
});
