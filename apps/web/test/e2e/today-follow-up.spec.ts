// A follow-up's day on Today (spec 3.5, 7): added on the lead's page, it shows in Today's Due today; done there, it
// leaves Today and the lead's timeline says "Follow-up done". Another, snoozed to tomorrow morning at 9:00 on the
// agency's clock, leaves Today too, and the lead says when it comes back. axe checks Today and its Snooze dialog.
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { addFollowUpThroughApi, addLeadThroughApi, leadInput } from "./support/leads";
import { animationsSettled } from "./support/settled";
import { laterToday } from "./support/work";

test("a follow-up added on a lead shows in Today and, done there, on the lead's timeline", async ({ page, agency }) => {
  await signInByEmail(page, agency.owner);
  const leadId = await addLeadThroughApi(page, leadInput({ trip: { destination: { kind: "new", name: "Kashmir" } } }));

  await page.goto(`/leads/${leadId}`);
  await page.getByRole("button", { name: "Add follow-up" }).click();
  const adding = page.getByRole("dialog", { name: "Add a follow-up" });
  await adding.getByLabel("What to do").fill("Send the Kashmir options");
  await adding.getByLabel("Time").fill(laterToday(90).at);
  await adding.getByRole("button", { name: "Add follow-up" }).click();
  await expect(adding).toBeHidden();

  await page.goto("/today");
  const dueToday = page.getByRole("region", { name: "Due today" });
  await expect(dueToday.getByRole("link", { name: "Rahul Sharma", exact: true })).toBeVisible();
  await expect(dueToday.getByText("Send the Kashmir options · Kashmir")).toBeVisible();
  // The new lead waits for a reply too.
  await expect(page.getByRole("region", { name: "New leads waiting for a reply" })).toBeVisible();
  await animationsSettled(page);
  await expectAccessible(page);

  await dueToday.getByRole("button", { name: "Done: Send the Kashmir options" }).click();
  await expect(page.getByText("Marked done")).toBeVisible();
  await expect(page.getByRole("region", { name: "Due today" })).toBeHidden();

  await page
    .getByRole("region", { name: "New leads waiting for a reply" })
    .getByRole("link", { name: "Rahul Sharma", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Rahul Sharma" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Timeline" }).getByText("Follow-up done")).toBeVisible();
});

test("a follow-up snoozed to tomorrow 9:00 leaves Today", async ({ page, agency }) => {
  await signInByEmail(page, agency.owner);
  const leadId = await addLeadThroughApi(page, leadInput());
  await addFollowUpThroughApi(page, leadId, { title: "Call about the Goa dates", ...laterToday(60) });

  await page.goto("/today");
  const dueToday = page.getByRole("region", { name: "Due today" });
  await dueToday.getByRole("button", { name: "Snooze: Call about the Goa dates" }).click();
  const snoozing = page.getByRole("dialog", { name: "Snooze" });
  await snoozing.getByRole("radio", { name: "Tomorrow morning, 9:00 am" }).check();
  await animationsSettled(page);
  await expectAccessible(page);
  await snoozing.getByRole("button", { name: "Snooze" }).click();
  await expect(snoozing).toBeHidden();
  await expect(page.getByText("Snoozed")).toBeVisible();
  await expect(page.getByRole("region", { name: "Due today" })).toBeHidden();

  await page.goto(`/leads/${leadId}`);
  await expect(page.getByRole("main").getByText("Follow up tomorrow, 9:00 am").first()).toBeVisible();
});
