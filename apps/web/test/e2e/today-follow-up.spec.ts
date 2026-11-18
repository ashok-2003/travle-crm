// My tasks' and Follow-ups' writes against the real api (spec 3.5, 7; web revamp):
// - a follow-up added on the lead's page shows on Follow-ups under Due today (never on My tasks, which only counts it
//   in its follow-ups line); done there, the next-follow-up dialog asks, and with "No more follow-ups" the lead's
//   timeline says "Follow-up done";
// - one snoozed to tomorrow morning at 9:00 on the agency's clock leaves Due, and the lead says when it comes back;
// - Add a task puts a task on a lead (found with the lead picker, over leads.list) and one standing alone under Due
//   today;
// - a new lead marked contacted leaves its section; one task snoozed for an hour and another to a chosen day.
// axe checks both screens and each dialog.
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { addFollowUpThroughApi, addLeadThroughApi, dayInIndia, leadInput, moveStageThroughApi } from "./support/leads";
import { opened } from "./support/sections";
import { animationsSettled } from "./support/settled";
import { addTaskThroughApi, fillDue, laterToday, timeInIndia, typedDay } from "./support/work";

/** "9:15 am", as the screens show a time of day ("HH:MM" on the agency's clock). */
const shownTime = (time: string) => {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return `${String(hours % 12 === 0 ? 12 : hours % 12)}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "am" : "pm"}`;
};

test("a follow-up added on a lead shows in Follow-ups and, done there, on the lead's timeline", async ({
  page,
  agency,
}) => {
  await signInByEmail(page, agency.owner);
  const leadId = await addLeadThroughApi(page, leadInput({ trip: { destination: { kind: "new", name: "Kashmir" } } }));

  await page.goto(`/leads/${leadId}`);
  await page.getByRole("button", { name: "Add follow-up" }).click();
  const adding = page.getByRole("dialog", { name: "Add a follow-up" });
  await adding.getByLabel("What to do").fill("Send the Kashmir options");
  await fillDue(adding, await laterToday(page, 90));
  await adding.getByRole("button", { name: "Add follow-up" }).click();
  await expect(adding).toBeHidden();

  // My tasks never lists it: a line says it is due. The new lead waits for a reply too.
  await page.goto("/today");
  await expect(page.getByRole("link", { name: "Follow-ups", exact: true }).first()).toBeVisible();
  await expect(page.getByText("1 follow-up due")).toBeVisible();
  await expect(page.getByText("Send the Kashmir options")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "New leads to contact" })).toBeVisible();

  await page.goto("/leads/follow-ups");
  const dueToday = page.getByRole("region", { name: "Due today" });
  await expect(dueToday.getByRole("link", { name: "Rahul Sharma", exact: true })).toBeVisible();
  await expect(dueToday.getByText("Send the Kashmir options")).toBeVisible();
  await animationsSettled(page);
  await expectAccessible(page);

  await dueToday.getByRole("button", { name: "Done: Send the Kashmir options" }).click();
  const next = page.getByRole("dialog", { name: "When's the next follow-up?" });
  // It opens once the task is done on the server: wait for it, or the settle check passes before it starts sliding in.
  await expect(next).toBeVisible();
  await animationsSettled(page);
  await expectAccessible(page);
  await next.getByRole("button", { name: "No more follow-ups" }).click();
  await expect(next).toBeHidden();
  await expect(page.getByText("Marked done")).toBeVisible();
  await expect(page.getByRole("region", { name: "Due today" })).toBeHidden();

  await page.goto(`/leads/${leadId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Rahul Sharma" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Timeline" }).getByText("Follow-up done")).toBeVisible();
});

test("a follow-up snoozed to tomorrow 9:00 leaves Due and shows under Later", async ({ page, agency }) => {
  await signInByEmail(page, agency.owner);
  const leadId = await addLeadThroughApi(page, leadInput());
  await addFollowUpThroughApi(page, leadId, { title: "Call about the Goa dates", ...(await laterToday(page, 60)) });

  await page.goto("/leads/follow-ups");
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
  await page.getByRole("tab", { name: "Later" }).click();
  await expect(page.getByRole("region", { name: "Tomorrow" }).getByText("Call about the Goa dates")).toBeVisible();

  await page.goto(`/leads/${leadId}`);
  await expect(page.getByRole("main").getByText("Follow up tomorrow, 9:00 am").first()).toBeVisible();
});

test("Add a task puts one on a lead found by search, and one standing alone, under Due today", async ({
  page,
  agency,
}) => {
  await signInByEmail(page, agency.owner);
  const leadId = await addLeadThroughApi(page, leadInput({ trip: { destination: { kind: "new", name: "Kashmir" } } }));
  await moveStageThroughApi(page, leadId, "contacted");
  const due = await laterToday(page, 90);

  await page.goto("/today");
  await page.getByRole("button", { name: "Add a task" }).click();
  const adding = page.getByRole("dialog", { name: "Add a task" });
  await adding.getByLabel("What to do").fill("Send the Kashmir quote");
  await fillDue(adding, due);
  await adding.getByRole("combobox", { name: "Lead" }).click();
  await page.getByRole("combobox", { name: "Search by name or phone" }).fill("Rahul");
  await page.getByRole("option", { name: /Rahul Sharma/ }).click();
  await expect(adding.getByRole("combobox", { name: "Lead" })).toHaveText(/Rahul Sharma/);
  // A task on a lead is for its owner: there is no one to choose.
  await expect(adding.getByRole("combobox", { name: "For" })).toHaveCount(0);
  await animationsSettled(page);
  await expectAccessible(page);
  await adding.getByRole("button", { name: "Add the task" }).click();
  await expect(adding).toBeHidden();
  const dueToday = page.getByRole("region", { name: "Due today" });
  await expect(dueToday.getByRole("link", { name: "Rahul Sharma", exact: true })).toBeVisible();
  await expect(dueToday.getByText("Send the Kashmir quote", { exact: true })).toBeVisible();
  await expect(dueToday.getByText("Kashmir", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Add a task" }).click();
  await adding.getByLabel("What to do").fill("Renew the IATA licence");
  await fillDue(adding, due);
  await expect(adding.getByRole("combobox", { name: "For" })).toHaveText(/Asha Sharma/);
  await adding.getByRole("button", { name: "Add the task" }).click();
  await expect(adding).toBeHidden();
  await expect(dueToday.getByText("Renew the IATA licence", { exact: true })).toBeVisible();
  await expect(dueToday.getByRole("button", { name: "Done: Renew the IATA licence" })).toBeVisible();
});

test("a new lead is marked contacted; one thing is snoozed for an hour, another to a chosen day", async ({
  page,
  agency,
}) => {
  await signInByEmail(page, agency.owner);
  await addLeadThroughApi(page, leadInput({ person: { name: "Arjun Mehta", phone: "+919769023418" } }));
  const priya = await addLeadThroughApi(page, leadInput({ person: { name: "Priya Nair", phone: "+919847031905" } }));
  await moveStageThroughApi(page, priya, "contacted");
  await addTaskThroughApi(page, priya, { title: "Call about the hotel", ...(await laterToday(page, 30)) });
  await addTaskThroughApi(page, priya, { title: "Send the itinerary", ...(await laterToday(page, 45)) });

  await page.goto("/today");
  const newLeads = page.getByRole("region", { name: "New leads to contact" });
  await opened(newLeads, "New leads to contact");
  await newLeads.getByRole("button", { name: "Mark Arjun Mehta contacted" }).click();
  // As the lead's own stage bar says it: Mark contacted is that same move.
  await expect(page.getByText("Moved to Contacted")).toBeVisible();
  await expect(newLeads).toBeHidden();
  await animationsSettled(page);
  await expectAccessible(page);

  // An hour on, from about now: today or, late at night, tomorrow.
  const dueToday = page.getByRole("region", { name: "Due today" });
  await dueToday.getByRole("button", { name: "Snooze: Call about the hotel" }).click();
  const snoozing = page.getByRole("dialog", { name: "Snooze" });
  await snoozing.getByRole("radio", { name: "In an hour" }).check();
  const anHourOn = [timeInIndia(60), timeInIndia(61)].map(shownTime);
  await snoozing.getByRole("button", { name: "Snooze" }).click();
  await expect(snoozing).toBeHidden();

  // The other to a day of the person's choosing, two days on.
  const chosenDay = dayInIndia(2);
  await dueToday.getByRole("button", { name: "Snooze: Send the itinerary" }).click();
  await snoozing.getByRole("radio", { name: "Choose a time" }).check();
  const day = snoozing.getByRole("textbox", { name: "Day" });
  await day.fill(typedDay(chosenDay));
  await snoozing.getByLabel("Time", { exact: true }).fill("16:30");
  await animationsSettled(page);
  await expectAccessible(page);
  await snoozing.getByRole("button", { name: "Snooze" }).click();
  await expect(snoozing).toBeHidden();
  await expect(dueToday.getByText("Send the itinerary", { exact: false })).toHaveCount(0);

  await page.goto(`/leads/${priya}`);
  const work = page.getByRole("list", { name: "Next follow-up" });
  await expect(work.getByText(new RegExp(`^Task due (today|tomorrow), (${anHourOn.join("|")})$`))).toBeVisible();
  const dayShown = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${chosenDay}T00:00:00Z`),
  );
  await expect(work.getByText(new RegExp(`^Task due ${dayShown}`))).toBeVisible();
});
