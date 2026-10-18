// A lead's stages and its work (spec 3.4, 4, R29-R31, P2): tapped forward and back on the stage bar; a follow-up added
// on the lead (two, listed earliest first) and one marked done; the trip edited and a note added; marked Lost after
// asking (focus back on the ⋯ button when the dialog is cancelled), which cancels its open follow-ups; reopened from
// where the bar sat to the stage it had. The timeline reads every kind as its sentence; on a phone the five steps are
// 44px, each over its segment and word, and "Booking requested" wraps.
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { addFollowUpThroughApi, addLeadThroughApi, dayInIndia, leadInput } from "./support/leads";
import { animationsSettled } from "./support/settled";

test("a lead moves forward and back, is marked Lost after asking, and reopens to its stage", async ({
  page,
  agency,
}, testInfo) => {
  await signInByEmail(page, agency.owner);
  const leadId = await addLeadThroughApi(page, leadInput({ trip: { adults: 2 } }));
  await addFollowUpThroughApi(page, leadId, { title: "Send the Goa options", on: dayInIndia(3), at: "11:00" });
  await addFollowUpThroughApi(page, leadId, { title: "Ask for passports", on: dayInIndia(2), at: "10:00" });
  await page.goto(`/leads/${leadId}`);

  const bar = () => page.getByRole("region", { name: /^Stage: / });
  await expect(bar()).toHaveAccessibleName("Stage: New");
  if (testInfo.project.name === "phone") {
    await expect(bar().getByRole("listitem")).toHaveCount(5);
    // The current stage, marked as the step, and the four others, each a button saying where it moves the lead; each
    // one 44px target over its segment and its word.
    const others = ["Contacted", "Quote sent", "Booking requested", "Won"];
    const steps = [
      bar().locator("[aria-current=step]"),
      ...others.map((stage) => bar().getByRole("button", { name: `Move to ${stage}` })),
    ];
    for (const step of steps) {
      const box = await step.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      await expect(step.locator("[data-segment]")).toHaveCount(1);
    }
    // The words wrap onto two lines in their fifth of the row, rather than running past it.
    const booking = bar().getByRole("button", { name: "Move to Booking requested" });
    const lines = await booking.getByText("Booking requested").evaluate((words) => {
      const range = document.createRange();
      range.selectNodeContents(words);
      return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
    });
    expect(lines).toBe(2);
    expect(await booking.evaluate((button) => button.scrollWidth <= button.clientWidth)).toBe(true);
  }

  // Two follow-ups, the earlier one first.
  const work = page.getByRole("list", { name: "Next follow-up" });
  await expect(work.getByRole("heading")).toHaveText(["Ask for passports", "Send the Goa options"]);
  await page.getByRole("button", { name: "Done: Ask for passports" }).click();
  await expect(work.getByRole("heading")).toHaveText(["Send the Goa options"]);

  await bar().getByRole("button", { name: "Move to Contacted" }).click();
  await expect(bar()).toHaveAccessibleName("Stage: Contacted");
  await bar().getByRole("button", { name: "Move to Quote sent" }).click();
  await expect(bar()).toHaveAccessibleName("Stage: Quote sent");
  await bar().getByRole("button", { name: "Move to Contacted" }).click();
  await expect(bar()).toHaveAccessibleName("Stage: Contacted");

  await page.getByRole("button", { name: "Edit the trip" }).click();
  const trip = page.getByRole("dialog", { name: "Edit the trip" });
  await trip.getByLabel("Leaving from").fill("Delhi");
  await trip.getByRole("button", { name: "Save" }).click();
  await expect(trip).toBeHidden();
  await page.getByLabel("Add a note").fill("Wants one night on a houseboat.");
  await page.getByRole("button", { name: "Add note" }).click();
  const timeline = page.getByRole("list", { name: "Timeline" });
  await expect(timeline.getByRole("listitem").first()).toContainText("Wants one night on a houseboat.");

  const menu = page.getByRole("button", { name: "More for Rahul Sharma" });
  await menu.click();
  await page.getByRole("menuitem", { name: "Lost" }).click();
  const asking = page.getByRole("alertdialog", { name: "Mark Rahul Sharma's lead as Lost?" });
  await animationsSettled(page);
  await expectAccessible(page);
  await asking.getByRole("button", { name: "Cancel" }).click();
  await expect(asking).toBeHidden();
  await expect(menu).toBeFocused();

  await menu.click();
  await page.getByRole("menuitem", { name: "Lost" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Mark as Lost" }).click();
  await expect(bar()).toHaveAccessibleName("Stage: Lost");
  await expect(bar().getByText("Reopen returns it to Contacted.")).toBeVisible();
  await expect(page.getByText("None set.")).toBeVisible();
  await expectAccessible(page);

  await bar().getByRole("button", { name: "Reopen" }).click();
  await expect(bar()).toHaveAccessibleName("Stage: Contacted");

  await expect(timeline.getByRole("heading")).toHaveText([
    "Moved to Contacted",
    // Marked Lost, the lead's open follow-up was cancelled in the same change.
    "Moved to Lost",
    "Follow-up cancelled",
    "Note",
    "Trip details changed",
    "Moved to Contacted",
    "Moved to Quote sent",
    "Moved to Contacted",
    "Follow-up done",
    "Follow-up added",
    "Follow-up added",
    "Lead added from a phone call",
  ]);
});
