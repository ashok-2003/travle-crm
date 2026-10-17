// Home's nudge (spec 3.1): with a follow-up overdue, a new lead waiting and a follow-up due later today, Home says
// "3 things today" with "1 overdue" and shows the three, overdue first, under the setup card; Open Today opens Today
// with the same three. New lead is the header's action. axe checks Home.
import { expect, signInByEmail, test } from "./support/fixtures";
import { addFollowUpThroughApi, addLeadThroughApi, leadInput, moveStageThroughApi } from "./support/leads";
import { addOverdueFollowUp, laterToday } from "./support/work";

test("Home shows the count and three things, and Open Today opens Today", async ({ page, agency }) => {
  await signInByEmail(page, agency.owner);
  const sneha = await addLeadThroughApi(page, leadInput({ person: { name: "Sneha Iyer", phone: "+919845011234" } }));
  await moveStageThroughApi(page, sneha, "contacted");
  await addOverdueFollowUp(page, sneha, "Send the Goa options");
  const priya = await addLeadThroughApi(page, leadInput({ person: { name: "Priya Nair", phone: "+919847031905" } }));
  await moveStageThroughApi(page, priya, "contacted");
  await addFollowUpThroughApi(page, priya, { title: "Confirm the Kedarnath dates", ...laterToday(120) });
  await addLeadThroughApi(page, leadInput());

  await page.goto("/");
  const nudge = page.getByRole("region", { name: /things today/ });
  await expect(nudge.getByRole("heading", { level: 2 })).toHaveText(/^3 things today\s*1 overdue$/);
  const things = nudge.getByRole("listitem");
  await expect(things).toHaveCount(3);
  await expect(things.nth(0)).toContainText("Sneha IyerSend the Goa optionsOverdue");
  await expect(things.nth(1)).toContainText("Rahul SharmaNew lead, no reply yet");
  await expect(things.nth(2)).toContainText("Priya NairConfirm the Kedarnath dates");
  await expect(page.getByRole("link", { name: "New lead", exact: true })).toHaveAttribute("href", "/leads/new");

  await nudge.getByRole("link", { name: "Open Today" }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Overdue" }).getByRole("link", { name: "Sneha Iyer", exact: true }),
  ).toBeVisible();
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
