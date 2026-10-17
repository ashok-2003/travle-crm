// The visual audit's work screens (release 1): the mockup's day, made through the api (R54): two follow-ups overdue
// (due this very minute), three new leads waiting and three things due later today, one a task on no lead. Home with
// its nudge under the setup card, Today, its Snooze and Add a task dialogs, Settings' destinations and blocked
// contacts, and a salesperson's empty Today.
import type { Page } from "@playwright/test";
import { expect, signInByCode, signInByEmail, test } from "../support/fixtures";
import {
  addFollowUpThroughApi,
  addLeadThroughApi,
  callApi,
  dayInIndia,
  leadInput,
  leadWorkerAgency,
  moveStageThroughApi,
} from "../support/leads";
import { addOverdueFollowUp, laterToday } from "../support/work";
import { openFromNavigation, screenshotsOnly, shoot } from "./camera";

test.beforeEach(screenshotsOnly);

/** A month two months from now, as the api takes one ("2026-12"). */
const soon = () => dayInIndia(60).slice(0, 7);

/** A lead in Contacted with a follow-up: overdue, or due `minutes` from now today. */
async function contactedWithFollowUp(
  page: Page,
  lead: { name: string; phone: string; destination: string; adults: number },
  followUp: { title: string; minutes: number | "overdue" },
): Promise<void> {
  const leadId = await addLeadThroughApi(
    page,
    leadInput({
      person: { name: lead.name, phone: lead.phone },
      trip: {
        destination: { kind: "new", name: lead.destination },
        when: { kind: "month", month: soon() },
        adults: lead.adults,
      },
    }),
  );
  await moveStageThroughApi(page, leadId, "contacted");
  if (followUp.minutes === "overdue") await addOverdueFollowUp(page, leadId, followUp.title);
  else
    await addFollowUpThroughApi(page, leadId, { title: followUp.title, ...(await laterToday(page, followUp.minutes)) });
}

/** The mockup's day for the signed-in Owner: 8 things, 2 overdue; and two contacts blocked. */
async function theMockupsDay(page: Page): Promise<void> {
  await contactedWithFollowUp(
    page,
    { name: "Sneha Iyer", phone: "+919845011234", destination: "Goa", adults: 6 },
    { title: "Send the Goa villa options", minutes: "overdue" },
  );
  await contactedWithFollowUp(
    page,
    { name: "Vikram Singh", phone: "+919928044120", destination: "Rajasthan", adults: 4 },
    { title: "Send the revised Rajasthan quote", minutes: "overdue" },
  );
  await addLeadThroughApi(
    page,
    leadInput({
      trip: { destination: { kind: "new", name: "Kashmir" }, when: { kind: "month", month: soon() }, adults: 2 },
    }),
  );
  await addLeadThroughApi(
    page,
    leadInput({
      person: { name: "Arjun Mehta", phone: "+919769023418" },
      source: "instagram",
      trip: { destination: { kind: "new", name: "Ladakh" }, when: { kind: "month", month: soon() }, adults: 3 },
    }),
  );
  await addLeadThroughApi(
    page,
    leadInput({
      person: { name: "Fatima Sheikh", phone: "+919820077341" },
      source: "website",
      trip: { destination: { kind: "new", name: "Andaman" }, adults: 2 },
    }),
  );
  await contactedWithFollowUp(
    page,
    { name: "Priya Nair", phone: "+919847031905", destination: "Kedarnath", adults: 4 },
    { title: "Confirm the Kedarnath dates", minutes: 120 },
  );
  await contactedWithFollowUp(
    page,
    { name: "Meera Pillai", phone: "+919847031906", destination: "Singapore", adults: 2 },
    { title: "Send the Singapore hotel options", minutes: 240 },
  );
  await callApi(page, "tasks.add", {
    title: "Renew the IATA licence",
    due: await laterToday(page, 300),
    assigneeUserId: null,
  });
  // A destination the agency typed twice ("Goa trip"), to merge; its lead is answered, so the day stays the mockup's.
  const rohan = await addLeadThroughApi(
    page,
    leadInput({
      person: { name: "Rohan Gupta", phone: "+919811045527" },
      trip: { destination: { kind: "new", name: "Goa trip" } },
    }),
  );
  await moveStageThroughApi(page, rohan, "contacted");
  // Two contacts blocked from leads: a number, and an email.
  const spam = await addLeadThroughApi(page, leadInput({ person: { name: "Cheap Tours", phone: "+919000011122" } }));
  await callApi(page, "leads.block", { leadId: spam });
  const offers = await addLeadThroughApi(
    page,
    leadInput({ person: { name: "Holiday Offers", email: "offers@deals.example" } }),
  );
  await callApi(page, "leads.block", { leadId: offers });
}

test("an Owner's day, its dialogs and Settings, and a salesperson's empty Today", async ({
  page,
  agency,
  addStaff,
}) => {
  await signInByEmail(page, agency.owner);
  const { ravi } = await leadWorkerAgency(page, { agency, addStaff });
  await theMockupsDay(page);

  await page.goto("/");
  await expect(page.getByRole("region", { name: /things today/ }).getByRole("listitem")).toHaveCount(3);
  await shoot(page, "home-today");

  await openFromNavigation(page, "Main", "Today");
  await expect(page.getByRole("region", { name: "Due today" }).getByText("Renew the IATA licence")).toBeVisible();
  await shoot(page, "today");

  await page.getByRole("button", { name: "Snooze: Confirm the Kedarnath dates" }).click();
  await expect(page.getByRole("dialog", { name: "Snooze" })).toBeVisible();
  await page.getByRole("radio", { name: "Choose a time" }).check();
  await shoot(page, "today-snooze");
  await page.getByRole("dialog", { name: "Snooze" }).getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Add a task" }).click();
  const adding = page.getByRole("dialog", { name: "Add a task" });
  await adding.getByLabel("What to do").fill("Collect the passport copies");
  await adding.getByLabel("Time").fill((await laterToday(page, 180)).at);
  await shoot(page, "today-add-task");
  await adding.getByRole("button", { name: "Cancel" }).click();

  await page.goto("/settings/destinations");
  await expect(page.getByRole("list", { name: "Destinations" }).getByText("Goa trip")).toBeVisible();
  await shoot(page, "settings-destinations");

  await page.goto("/settings/blocked-contacts");
  await expect(page.getByRole("list", { name: "Blocked contacts" }).getByRole("listitem")).toHaveCount(2);
  await shoot(page, "settings-blocked-contacts");

  // Ravi on the same device, with nothing to do yet: the Owner signs out first.
  await page.context().clearCookies();
  await signInByCode(page, { code: agency.code, staff: ravi });
  await page.goto("/today");
  await expect(page.getByText("Nothing for today")).toBeVisible();
  await shoot(page, "today-empty");
});
