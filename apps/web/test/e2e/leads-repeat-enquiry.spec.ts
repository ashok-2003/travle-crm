// A repeat enquiry (spec 3.2, R24): the same number typed again is named before saving, with its open lead's
// destination and owner. Added to that lead, the enquiry and its note land on its timeline; as a new trip enquiry it
// makes a second lead for the same person, marked Returning, whose info hint says what that means: a popover tapped
// open on a phone, a tooltip on hover with a mouse. A number with no open lead just makes its lead.
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { addLeadThroughApi, callApi, leadInput } from "./support/leads";
import { animationsSettled } from "./support/settled";

test("a repeat enquiry goes on the open lead's timeline, or makes a new trip enquiry marked returning", async ({
  page,
  agency,
}, testInfo) => {
  await signInByEmail(page, agency.owner);
  const kashmir = await addLeadThroughApi(page, leadInput({ trip: { destination: { kind: "new", name: "Kashmir" } } }));

  await page.goto("/leads/new");
  await page.getByLabel("Name", { exact: true }).fill("Rahul S");
  await page.getByLabel("Phone", { exact: true }).fill("098765 43210");
  await expect(page.getByText("Rahul Sharma already has an open lead (Kashmir, with Asha Sharma)")).toBeVisible();
  await expect(page.getByText("It's saved under the name we have for them: Rahul Sharma.")).toBeVisible();
  await animationsSettled(page);
  await expectAccessible(page);

  // Saving without choosing points at the choice.
  await page.getByRole("button", { name: "Save lead" }).click();
  await expect(page.getByText("Choose what to do with the open lead above, then save.")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Add to that lead" })).toBeFocused();

  await page.getByRole("radio", { name: "Add to that lead" }).check();
  await page.getByLabel("Notes", { exact: true }).fill("Now wants a houseboat night too");
  await page.getByRole("button", { name: "Save lead" }).click();
  await expect(page).toHaveURL(new RegExp(`/leads/${kashmir}$`));
  const timeline = page.getByRole("list", { name: "Timeline" });
  await expect(timeline.getByRole("listitem").first()).toContainText("Asked again");
  await expect(timeline.getByRole("listitem").first()).toContainText("Now wants a houseboat night too");

  await page.goto("/leads/new");
  await page.getByLabel("Name", { exact: true }).fill("Rahul Sharma");
  await page.getByLabel("Phone", { exact: true }).fill("+91 98765 43210");
  await page.getByRole("radio", { name: "New trip enquiry" }).check();
  await page.getByRole("button", { name: "Save lead" }).click();
  // A lead of its own: the address names a lead, and not the Kashmir one.
  await expect(page).toHaveURL(/\/leads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  expect(new URL(page.url()).pathname).not.toBe(`/leads/${kashmir}`);
  await expect(page.getByRole("heading", { level: 1, name: "Rahul Sharma" })).toBeVisible();
  await expect(page.getByRole("main").getByText("Returning").first()).toBeVisible();
  const returning = page.getByRole("button", { name: "What does Returning mean?" });
  const meaning =
    "This person has enquired with your agency before, so they are a repeat customer. This lead is their new enquiry.";
  if (testInfo.project.name === "phone") {
    await returning.tap();
    await expect(page.getByRole("dialog", { name: "Returning" })).toHaveAccessibleDescription(meaning);
  } else {
    await returning.hover();
    await expect(page.getByRole("tooltip")).toHaveText(meaning);
    await expect(returning).toHaveAccessibleDescription(meaning);
  }
  await animationsSettled(page);
  await expectAccessible(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Returning" })).toBeHidden();
  await expect(page.getByRole("tooltip")).toBeHidden();

  // With no open lead, whatever the form had chosen, the lead is simply made.
  const fresh = await callApi<{ outcome: string; leadId: string | null }>(
    page,
    "leads.create",
    leadInput({ person: { name: "Meera Pillai", phone: "+919847031905" }, whenOpenLead: "new-lead" }),
  );
  expect(fresh.outcome).toBe("created");
  expect(fresh.leadId).not.toBeNull();
});
