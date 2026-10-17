// Reassigning a lead (spec 3.4, 4, R21): an Owner gives a lead, with its open follow-up, to Ravi, a salesperson; the
// owner card and the timeline say so. The follow-up is Ravi's now: it leaves the Owner's Today and is in his, which
// lists only his own. Ravi, signed in on his own device (the project's: a phone or a desktop), finds the lead in his
// Leads with its follow-up; axe checks his screens too.
import { expectAccessible } from "./support/accessibility";
import { expect, signInByCode, signInByEmail, test } from "./support/fixtures";
import { addLeadThroughApi, anotherPersonsDevice, leadInput, leadWorkerAgency } from "./support/leads";
import { animationsSettled } from "./support/settled";
import { addOverdueFollowUp } from "./support/work";

test("an Owner reassigns a lead; Ravi finds it in his Leads", async ({ page, browser, agency, addStaff }) => {
  await signInByEmail(page, agency.owner);
  const { ravi } = await leadWorkerAgency(page, { agency, addStaff });
  const leadId = await addLeadThroughApi(page, leadInput());
  // Overdue at once, so it is in its assignee's Today whatever the time of day.
  await addOverdueFollowUp(page, leadId, "Send the Goa options");
  await page.goto("/today");
  const followUp = /Send the Goa options/;
  await expect(page.getByRole("region", { name: "Overdue" }).getByText(followUp)).toBeVisible();

  await page.goto(`/leads/${leadId}`);
  const ownerCard = page.getByRole("region", { name: "Owner and source" });
  await expect(ownerCard.getByText("Asha Sharma", { exact: true })).toBeVisible();
  await ownerCard.getByRole("button", { name: "Reassign" }).click();
  const dialog = page.getByRole("dialog", { name: "Reassign" });
  await dialog.getByRole("combobox", { name: "Owner" }).click();
  await page.getByRole("option", { name: "Ravi Kumar" }).click();
  await animationsSettled(page);
  await expectAccessible(page);
  await dialog.getByRole("button", { name: "Reassign" }).click();
  await expect(page.getByText("Reassigned to Ravi Kumar")).toBeVisible();
  await expect(ownerCard.getByText("Ravi Kumar", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Timeline" }).getByText("Assigned to Ravi Kumar")).toBeVisible();
  // The Owner's day is empty now: the lead and its follow-up are both Ravi's.
  await page.goto("/today");
  await expect(page.getByText("Nothing for today")).toBeVisible();
  await expect(page.getByText(followUp)).toHaveCount(0);

  const ravisPhone = await anotherPersonsDevice(browser);
  const ravisPage = await ravisPhone.newPage();
  await signInByCode(ravisPage, { code: agency.code, staff: ravi });
  await ravisPage.goto("/today");
  await expect(ravisPage.getByRole("region", { name: "Overdue" }).getByText(followUp)).toBeVisible();
  await ravisPage.goto("/leads");
  await expect(ravisPage.getByRole("radio", { name: /^Mine · open/ })).toBeVisible();
  await expect(ravisPage.getByRole("tablist")).toHaveCount(0);
  await expectAccessible(ravisPage);
  await ravisPage
    .getByRole("main")
    .getByRole("link", { name: /Rahul Sharma/ })
    .click();
  await expect(ravisPage.getByRole("heading", { level: 1, name: "Rahul Sharma" })).toBeVisible();
  await expect(ravisPage.getByRole("list", { name: "Next follow-up" }).getByText("Send the Goa options")).toBeVisible();
  await expectAccessible(ravisPage);
  // A salesperson can't reassign: the ⋯ menu offers Lost and Not a lead only.
  await ravisPage.getByRole("button", { name: "More for Rahul Sharma" }).click();
  await expect(ravisPage.getByRole("menuitem")).toHaveText(["Lost", "Not a lead"]);
  await ravisPhone.close();
});
