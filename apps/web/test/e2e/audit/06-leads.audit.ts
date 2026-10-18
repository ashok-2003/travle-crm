// The visual audit's lead screens (release 1): Leads empty, then an agency's week of leads as the mockup draws them
// (trips, budgets, a returning customer, follow-ups, two of them Ravi's), Everyone filtered by a stage, the Filters
// dialog, the new-lead form filled in and with a known contact, a lead (on a computer also at 1280px, the narrowest
// with the timeline beside the cards) with its menu, Reassign and Block, follow-up dialog and trip editor, a returning
// customer's lead with Returning's info hint open, a lost lead with Reopen, the form warning of a blocked number, and
// a salesperson's own list. Every lead is made through the api (R54).
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
import { screenshotsOnly, shoot } from "./camera";

test.beforeEach(screenshotsOnly);

/** A month two months from now, as the api takes one ("2026-12"). */
const soon = () => dayInIndia(60).slice(0, 7);

/** "2026-12" as the form's month list names it, "December 2026". */
const monthName = (month: string) =>
  new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );

/** The mockup's leads, the Owner's and Ravi's; gives Rahul Sharma's lead, Amit's returning one and the lost one. */
async function aWeekOfLeads(page: Page, raviId: string): Promise<{ rahul: string; returning: string; lost: string }> {
  const rahul = await addLeadThroughApi(
    page,
    leadInput({
      trip: {
        destination: { kind: "new", name: "Kashmir" },
        when: { kind: "month", month: soon() },
        adults: 2,
        childrenAges: [7],
        budget: { amount: { amountPaise: 6_000_000, currency: "INR" }, basis: "per_person" },
        departureCity: "Delhi",
        tripType: "family",
        hotelCategory: "4_star",
        food: "veg",
      },
      note: "Wants one night on a houseboat in Srinagar. Asked for options under ₹60,000 per person.",
    }),
  );
  const sneha = await addLeadThroughApi(
    page,
    leadInput({
      person: { name: "Sneha Iyer", phone: "+919845011234" },
      source: "instagram",
      trip: { destination: { kind: "new", name: "Goa" }, when: { kind: "month", month: soon() }, adults: 6 },
    }),
  );
  await moveStageThroughApi(page, sneha, "contacted");
  await addFollowUpThroughApi(page, sneha, { title: "Send the Goa villa options", on: dayInIndia(1), at: "17:00" });
  const priya = await addLeadThroughApi(
    page,
    leadInput({
      person: { name: "Priya Nair", phone: "+919847031905" },
      trip: {
        destination: { kind: "new", name: "Kedarnath" },
        when: { kind: "dates", from: dayInIndia(28), to: dayInIndia(34) },
        adults: 4,
        budget: { amount: { amountPaise: 18_000_000, currency: "INR" }, basis: "for_everyone" },
      },
    }),
  );
  await moveStageThroughApi(page, priya, "contacted");
  await addFollowUpThroughApi(page, priya, { title: "Confirm the helicopter dates", on: dayInIndia(2), at: "16:00" });
  // Amit had a trip with the agency before: his new enquiry is marked Returning.
  const amit = { name: "Amit Verma", phone: "+919811045526" };
  const earlier = await addLeadThroughApi(page, leadInput({ person: amit }));
  await moveStageThroughApi(page, earlier, "won");
  const again = await addLeadThroughApi(
    page,
    leadInput({
      person: amit,
      trip: { destination: { kind: "new", name: "Manali" }, when: { kind: "flexible" }, adults: 2 },
    }),
  );
  await moveStageThroughApi(page, again, "quote_sent");
  await addLeadThroughApi(
    page,
    leadInput({
      person: { name: "Arjun Mehta", phone: "+919769023418" },
      source: "instagram",
      trip: { destination: { kind: "new", name: "Ladakh" }, when: { kind: "month", month: soon() }, adults: 3 },
    }),
  );
  const vikram = await addLeadThroughApi(
    page,
    leadInput({
      person: { name: "Vikram Singh", phone: "+919928044120" },
      source: "referral",
      sourceDetail: "Priya Nair",
      ownerUserId: raviId,
      trip: {
        destination: { kind: "new", name: "Rajasthan" },
        when: { kind: "dates", from: dayInIndia(60), to: dayInIndia(66) },
        adults: 4,
      },
    }),
  );
  await moveStageThroughApi(page, vikram, "quote_sent");
  await addLeadThroughApi(
    page,
    leadInput({
      person: { name: "Deepa Krishnan", phone: "+919444087612" },
      ownerUserId: raviId,
      trip: { destination: { kind: "new", name: "Sikkim" }, adults: 2 },
    }),
  );
  const lost = await addLeadThroughApi(
    page,
    leadInput({
      person: { name: "Kiran Joshi", phone: "+919004066321" },
      source: "website",
      trip: { destination: { kind: "new", name: "Kerala" }, adults: 2 },
    }),
  );
  await moveStageThroughApi(page, lost, "contacted");
  await moveStageThroughApi(page, lost, "lost");
  return { rahul, returning: again, lost };
}

test("an Owner's leads, a lead and its dialogs, and a salesperson's own list", async ({ page, agency, addStaff }) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/leads");
  await expect(page.getByText("No open leads yet. Add one when someone asks about a trip.")).toBeVisible();
  await shoot(page, "leads-empty");

  const { ravi } = await leadWorkerAgency(page, { agency, addStaff });
  const { rahul, returning, lost } = await aWeekOfLeads(page, ravi.userId);
  await page.goto("/leads");
  await expect(page.getByRole("main").getByText("Sneha Iyer").first()).toBeVisible();
  await shoot(page, "leads");

  await page.goto("/leads?view=everyone&stage=contacted");
  await expect(page.getByRole("main").getByText("Priya Nair").first()).toBeVisible();
  await shoot(page, "leads-everyone");
  await page.getByRole("button", { name: "Filters" }).click();
  await expect(page.getByRole("dialog", { name: "Filters" })).toBeVisible();
  await shoot(page, "leads-filters");

  await page.goto("/leads/new");
  await page.getByLabel("Name", { exact: true }).fill("Meera Pillai");
  await page.getByLabel("Phone", { exact: true }).fill("98470 31906");
  await page.getByLabel("Email", { exact: true }).fill("meera.pillai@example.com");
  await page.getByRole("combobox", { name: "When" }).click();
  await page.getByRole("option", { name: "A month" }).click();
  await page.getByRole("combobox", { name: "Month" }).click();
  await page.getByRole("option", { name: monthName(soon()) }).click();
  await page.getByLabel("Adults", { exact: true }).fill("2");
  await page.getByLabel("Budget", { exact: true }).fill("320000");
  await page.getByLabel("Notes", { exact: true }).fill("Two children; wants Universal Studios and a night safari.");
  await shoot(page, "lead-new");

  await page.goto("/leads/new");
  await page.getByLabel("Name", { exact: true }).fill("Rahul S");
  await page.getByLabel("Phone", { exact: true }).fill("98765 43210");
  await expect(page.getByRole("group", { name: "What to do with this enquiry" })).toBeVisible();
  await shoot(page, "lead-new-known-contact");

  await page.goto(`/leads/${rahul}`);
  await expect(page.getByRole("heading", { level: 1, name: "Rahul Sharma" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Timeline" }).getByText("Note")).toBeVisible();
  await shoot(page, "lead");
  if (test.info().project.name === "desktop") {
    // The narrowest computer that gets two columns: the cards and the timeline must both still read well.
    const viewport = page.viewportSize();
    await page.setViewportSize({ width: 1280, height: 800 });
    await shoot(page, "lead-1280");
    if (viewport) await page.setViewportSize(viewport);
  }
  await page.getByRole("button", { name: "More for Rahul Sharma" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await shoot(page, "lead-menu");
  await page.getByRole("menuitem", { name: "Reassign" }).click();
  const reassign = page.getByRole("dialog", { name: "Reassign" });
  await expect(reassign.getByRole("combobox", { name: "Owner" })).toBeVisible();
  await shoot(page, "lead-reassign");
  await reassign.getByRole("button", { name: "Cancel" }).click();
  await expect(reassign).toBeHidden();
  await page.getByRole("button", { name: "More for Rahul Sharma" }).click();
  await page.getByRole("menuitem", { name: "Block this number" }).click();
  const block = page.getByRole("alertdialog", { name: "Block Rahul Sharma's contact?" });
  await expect(block).toBeVisible();
  await shoot(page, "lead-block");
  await block.getByRole("button", { name: "Cancel" }).click();
  await expect(block).toBeHidden();
  await page.getByRole("button", { name: "Add follow-up" }).click();
  const followUp = page.getByRole("dialog", { name: "Add a follow-up" });
  await followUp.getByLabel("What to do").fill("Send the Kashmir houseboat options");
  await followUp.getByLabel("Time").fill("16:00");
  await shoot(page, "lead-follow-up");
  await followUp.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Edit the trip" }).click();
  await expect(page.getByRole("dialog", { name: "Edit the trip" })).toBeVisible();
  await shoot(page, "lead-edit-trip");

  await page.goto(`/leads/${returning}`);
  const hint = page.getByRole("button", { name: "What does Returning mean?" });
  // A tap on a phone; on a computer the keyboard's focus, which (unlike a hover) the camera's pointer can't close.
  const phone = test.info().project.name === "phone";
  await (phone ? hint.tap() : hint.focus());
  await expect(page.getByRole(phone ? "dialog" : "tooltip")).toBeVisible();
  await shoot(page, "lead-hint");

  await page.goto(`/leads/${lost}`);
  await expect(page.getByRole("button", { name: "Reopen" })).toBeVisible();
  await shoot(page, "lead-lost");

  // Kiran's number, blocked from that lead, comes back with a new enquiry: the form warns, and says what blocked means.
  await callApi(page, "leads.block", { leadId: lost });
  await page.goto("/leads/new");
  await page.getByLabel("Name", { exact: true }).fill("Kiran Joshi");
  await page.getByLabel("Phone", { exact: true }).fill("90040 66321");
  await expect(page.getByRole("button", { name: "What does blocked mean?" })).toBeVisible();
  await shoot(page, "lead-new-blocked");

  // Ravi on the same device: the Owner signs out first.
  await page.context().clearCookies();
  await signInByCode(page, { code: agency.code, staff: ravi });
  await page.goto("/leads");
  await expect(page.getByRole("main").getByText("Vikram Singh").first()).toBeVisible();
  await shoot(page, "leads-sales");
});
