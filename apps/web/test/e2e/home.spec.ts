// Home's main path (spec 5): the period filter in the header, the leads card whose stage cards open the Leads list at
// that stage and period, and Your tasks today, whose rows lead to their lead and whose View all opens My tasks. With
// three follow-ups due and a new lead waiting, the card shows the new lead and "3 follow-ups due". axe checks Home.
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { addFollowUpThroughApi, addLeadThroughApi, leadInput, moveStageThroughApi } from "./support/leads";
import { addOverdueFollowUp, laterToday } from "./support/work";

test("Home's tasks lead to their leads and My tasks, and a stage card opens Leads at that stage", async ({
  page,
  agency,
}) => {
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

  await page.goto("/dashboard");
  // The period filter is the header's action, This month chosen; the old nudge, tiles and screens list are gone.
  await expect(
    page.getByRole("radiogroup", { name: "Period" }).getByRole("radio", { name: "This month" }),
  ).toBeChecked();
  await expect(page.getByRole("link", { name: "New lead", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: /things today/ })).toHaveCount(0);
  await expect(page.getByText("Your screens:")).toHaveCount(0);

  // My tasks leaves follow-ups to the Follow-ups board, so the card holds the new lead and says how many are due.
  const tasks = page.getByRole("region", { name: "Your tasks today" });
  const rows = tasks.getByRole("listitem");
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0).getByRole("link")).toHaveAttribute("href", `/leads/${rahul}`);
  await expect(rows.nth(0).getByText("New lead, not contacted yet", { exact: true })).toBeVisible();
  await expect(tasks.getByText("3 follow-ups due")).toBeVisible();
  await expect(tasks.getByRole("link", { name: "Follow-ups" })).toHaveAttribute("href", "/leads/follow-ups");
  await expectAccessible(page);

  // A stage card opens the Leads list at that stage, for the period.
  const leads = page.getByRole("region", { name: "Leads", exact: true });
  await expect(leads.getByText("Total leads")).toBeVisible();
  await leads.getByRole("link", { name: /^Contacted\s*3$/ }).click();
  await expect(page).toHaveURL(/\/leads\?view=everyone&stage=contacted&created=month$/);
  await expect(page.getByRole("link", { name: "Sneha Iyer" }).first()).toBeVisible();

  // View all opens My tasks, with the new lead to contact.
  await page.goto("/dashboard");
  await tasks.getByRole("link", { name: "View all" }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("heading", { level: 1, name: "My tasks" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "New leads to contact" }).getByRole("link", { name: "Rahul Sharma", exact: true }),
  ).toBeVisible();
});
