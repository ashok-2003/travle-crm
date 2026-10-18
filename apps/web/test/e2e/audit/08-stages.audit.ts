// The visual audit's stage colours (owner feedback round 1): a lead at every stage, so Everyone's open list shows each
// open stage's badge and the chips their dots, Filters' stage list every stage's dot; a new lead's stage bar, one fifth
// filled; a lead at Quote sent, its bar filled three fifths with the passed words ticked, and its timeline's dots (two
// stage changes, a follow-up done); one of its steps focused from the keyboard, to see the outline sit whole on the
// step over the bar; that bar on a 360px phone, the lead at 1280px, and a step under a mouse's pointer; a won lead's
// bar, full and green; and a Not a lead lead, its info hint open. Every lead is made through the api (R54).
import { expect, signInByEmail, test } from "../support/fixtures";
import { addFollowUpThroughApi, addLeadThroughApi, dayInIndia, leadInput, moveStageThroughApi } from "../support/leads";
import { screenshotsOnly, shoot } from "./camera";

test.beforeEach(screenshotsOnly);

test("each stage's colour in the list, Filters, the stage bar and the timeline", async ({ page, agency }) => {
  await signInByEmail(page, agency.owner);
  const at = async (name: string, phone: string, stages: Parameters<typeof moveStageThroughApi>[2][]) => {
    const leadId = await addLeadThroughApi(page, leadInput({ person: { name, phone } }));
    for (const stage of stages) await moveStageThroughApi(page, leadId, stage);
    return leadId;
  };
  const rahul = await at("Rahul Sharma", "+919876543210", []);
  await at("Sneha Iyer", "+919845011234", ["contacted"]);
  const amit = await at("Amit Verma", "+919811045526", ["contacted", "quote_sent"]);
  await at("Arjun Mehta", "+919769023418", ["contacted", "quote_sent", "booking_requested"]);
  const priya = await at("Priya Nair", "+919847031905", ["contacted", "quote_sent", "booking_requested", "won"]);
  await at("Kiran Joshi", "+919004066321", ["contacted", "lost"]);
  const deepa = await at("Deepa Krishnan", "+919444087612", ["not_a_lead"]);
  await addFollowUpThroughApi(page, amit, { title: "Send the Manali options", on: dayInIndia(1), at: "11:00" });

  await page.goto("/leads?view=everyone");
  await expect(page.getByRole("main").getByText("Arjun Mehta").first()).toBeVisible();
  await shoot(page, "stages-leads");
  await page.getByRole("button", { name: "Filters" }).click();
  const filters = page.getByRole("dialog", { name: "Filters" });
  await filters.getByRole("combobox", { name: "Stage" }).click();
  await expect(page.getByRole("option", { name: "Not a lead" })).toBeVisible();
  await shoot(page, "stages-filter-list");

  await page.goto(`/leads/${rahul}`);
  await shoot(page, "lead-stage-new", { element: page.getByRole("region", { name: "Stage: New" }) });

  await page.goto(`/leads/${amit}`);
  await page.getByRole("button", { name: "Done: Send the Manali options" }).click();
  const timeline = page.getByRole("list", { name: "Timeline" });
  await expect(timeline.getByText("Follow-up done")).toBeVisible();
  await shoot(page, "lead-stage-midway");
  const bar = page.getByRole("region", { name: "Stage: Quote sent" });
  // From the keyboard, as :focus-visible needs: back a step and forwards again onto Booking requested.
  await bar.getByRole("button", { name: "Move to Booking requested" }).focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await shoot(page, "lead-stage-focus", { element: bar });
  // The narrowest phone the product serves, and the narrowest computer with two columns.
  const viewport = page.viewportSize();
  if (test.info().project.name === "phone") {
    await page.setViewportSize({ width: 360, height: 780 });
    await shoot(page, "lead-stage-360", { element: bar });
  } else {
    await page.setViewportSize({ width: 1280, height: 800 });
    await shoot(page, "lead-stage-1280");
  }
  if (viewport) await page.setViewportSize(viewport);
  if (test.info().project.name === "desktop") {
    // The pointer over Won, a mouse's: its tint wraps the step, under the bar.
    await bar.getByRole("button", { name: "Move to Booking requested" }).blur();
    await shoot(page, "lead-stage-hover", { element: bar, hover: bar.getByRole("button", { name: "Move to Won" }) });
  }

  await page.goto(`/leads/${priya}`);
  await expect(page.getByRole("region", { name: "Stage: Won" })).toBeVisible();
  await shoot(page, "lead-won");

  await page.goto(`/leads/${deepa}`);
  await page.getByRole("button", { name: "What does Not a lead mean?" }).click();
  await expect(page.getByText("For spam, a wrong number, a supplier", { exact: false }).first()).toBeVisible();
  await shoot(page, "lead-not-a-lead");
});
