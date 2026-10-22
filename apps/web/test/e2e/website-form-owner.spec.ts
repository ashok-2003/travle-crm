// The Owner's side of the website form (spec 13, journeys 1 and 2): turning the form on and editing it on the settings page,
// a visitor in a second browser with no sign-in sending an enquiry that becomes a lead, and the questions the Owner chose
// changing the visitor's page and what is saved from it.
import { expect, signInByEmail, test } from "./support/fixtures";
import { addLeadThroughApi, callApi, leadInput } from "./support/leads";
import { animationsSettled } from "./support/settled";
import {
  fillVisitor,
  leadsOf,
  leadsOfPhone,
  newPhone,
  openHosted,
  timelineOf,
  visitorsDevice,
} from "./support/website-form";

const settingsPage = "/settings/lead-sources/website-form";

test("the Owner turns the form on and edits it, a visitor sends an enquiry, and the lead and notice arrive", async ({
  page,
  browser,
  agency,
}) => {
  await signInByEmail(page, agency.owner);
  await page.goto(settingsPage);
  await expect(page.getByRole("heading", { level: 1, name: "Website form" })).toBeVisible();
  await page.getByRole("switch", { name: "Take enquiries from the form" }).click();
  await expect(page.getByText("On. Anyone with the link can send an enquiry.")).toBeVisible();

  await page.getByLabel("Heading", { exact: true }).fill("Come to Goa with Sharma Travels");
  await page.getByLabel("Thank-you message").fill("We will ring you tonight.");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved. The form now uses these settings.")).toBeVisible();
  const link = await page.getByLabel("The form's address").inputValue();
  expect(link).toContain("/f/");

  // Preview: the visitors' own form, filled with sample text, Send off.
  await page.getByRole("button", { name: "Preview" }).click();
  const preview = page.getByRole("dialog", { name: "Preview" });
  await expect(preview.getByRole("heading", { name: "Come to Goa with Sharma Travels" })).toBeVisible();
  await expect(preview.getByLabel("Your name")).toHaveValue("Asha Rao");
  await expect(preview.getByRole("button", { name: "Send enquiry" })).toBeDisabled();
  await expect(preview.getByText("Nothing is sent from the preview.")).toBeVisible();
  await animationsSettled(page);
  await preview.getByRole("button", { name: "Done" }).click();

  // The visitor: another browser, signed in nowhere.
  const visitor = await visitorsDevice(browser);
  const visitorPage = await visitor.newPage();
  await visitorPage.goto(link);
  await expect(visitorPage.getByRole("heading", { level: 1, name: "Come to Goa with Sharma Travels" })).toBeVisible();
  const phone = newPhone();
  await fillVisitor(visitorPage, { name: "Meera Pillai", phone });
  const send = visitorPage.getByRole("button", { name: "Send enquiry" });
  await expect(send).toBeEnabled();
  // A person takes more than two seconds to fill a form (W37).
  await visitorPage.waitForTimeout(2_200);
  await send.click();
  await expect(visitorPage.getByRole("heading", { level: 1, name: "Thank you" })).toBeVisible();
  await expect(visitorPage.getByText("We will ring you tonight.")).toBeVisible();
  await visitor.close();

  // The lead: "Website form", owned by the Owner, with the notice in the Owner's bell.
  const [lead] = await leadsOfPhone(page, phone);
  expect(lead).toMatchObject({ source: "web_form", person: { name: "Meera Pillai" }, stage: "new" });
  const owner = (await callApi<{ userId: string; name: string }[]>(page, "leads.owners", {})).find(
    (worker) => worker.name === agency.owner.name,
  );
  expect(lead?.ownerUserId).toBe(owner?.userId);
  await page.goto(`/leads/${lead?.id ?? ""}`);
  await expect(page.getByRole("heading", { level: 1, name: "Meera Pillai" })).toBeVisible();
  await expect(page.getByRole("main").getByText("Website form").first()).toBeVisible();
  const bell = page.getByRole("button", { name: /^Notifications/ }).filter({ visible: true });
  await expect(bell).toHaveAccessibleName("Notifications, 1 unread");
  await bell.click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await expect(panel.getByText("New lead assigned to you")).toBeVisible();
  await expect(panel.getByText("Meera Pillai")).toBeVisible();
});

test("the questions the Owner chose change the page, show their sentences, and decide what is saved", async ({
  page,
  browser,
  agency,
}) => {
  await signInByEmail(page, agency.owner);
  await addLeadThroughApi(
    page,
    leadInput({
      person: { name: "Rahul Sharma", phone: "+919876543210" },
      trip: { destination: { kind: "new", name: "Kashmir" } },
    }),
  );
  await page.goto(settingsPage);
  await page.getByRole("switch", { name: "Take enquiries from the form" }).click();
  await expect(page.getByText("On. Anyone with the link can send an enquiry.")).toBeVisible();
  await page.getByRole("combobox", { name: "Budget" }).click();
  await page.getByRole("option", { name: "Required" }).click();
  await page.getByRole("combobox", { name: "Email" }).click();
  await page.getByRole("option", { name: "Off" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved. The form now uses these settings.")).toBeVisible();
  const link = await page.getByLabel("The form's address").inputValue();

  const visitor = await visitorsDevice(browser);
  const visitorPage = await openHosted(visitor, link.split("/f/")[1] ?? "");
  await expect(visitorPage.getByLabel("Your name")).toBeVisible();
  // Email is off, Budget is on and asked for.
  await expect(visitorPage.getByLabel("Email", { exact: true })).toHaveCount(0);
  await expect(visitorPage.getByLabel("Budget", { exact: true })).toBeVisible();

  // A missing required answer and a phone that isn't one: each sentence is under its own field.
  await visitorPage.getByLabel("Your name", { exact: true }).fill("Meera Pillai");
  await visitorPage.getByLabel("Phone", { exact: true }).fill("123");
  const send = visitorPage.getByRole("button", { name: "Send enquiry" });
  await expect(send).toBeEnabled();
  await send.click();
  await expect(visitorPage.getByText("Use a phone number like 98765 43210")).toBeVisible();
  await expect(visitorPage.getByText("Please fill this in.")).toBeVisible();

  // Somewhere else, with a place the agency doesn't have: no destination is made, the words go in the note.
  const phone = newPhone();
  await fillVisitor(visitorPage, { name: "Meera Pillai", phone });
  await visitorPage.getByLabel("Budget", { exact: true }).fill("50000");
  await visitorPage.getByRole("combobox", { name: "Where would you like to go?" }).click();
  await visitorPage.getByRole("option", { name: "Kashmir" }).waitFor();
  await visitorPage.getByRole("option", { name: "Somewhere else" }).click();
  await visitorPage.getByLabel("Which place?").fill("Spiti Valley");
  await visitorPage.waitForTimeout(2_200);
  await send.click();
  await expect(visitorPage.getByRole("heading", { level: 1, name: "Thank you" })).toBeVisible();
  const [typed] = await leadsOfPhone(page, phone);
  expect(typed?.trip.destinationName).toBeNull();
  const notes = (await timelineOf(page, typed?.id ?? "")).entries.flatMap((entry) =>
    entry.kind === "note" ? [entry.body] : [],
  );
  expect(notes.join("\n")).toContain("Destination asked for: Spiti Valley");
  const known = await callApi<{ name: string }[]>(page, "destinations.search", { limit: 100 });
  expect(known.map((destination) => destination.name)).toEqual(["Kashmir"]);

  // A destination chosen from the list is the lead's destination.
  const second = await openHosted(visitor, link.split("/f/")[1] ?? "");
  const otherPhone = newPhone();
  await fillVisitor(second, { name: "Ishaan Rao", phone: otherPhone });
  await second.getByLabel("Budget", { exact: true }).fill("80000");
  await second.getByRole("combobox", { name: "Where would you like to go?" }).click();
  await second.getByRole("option", { name: "Kashmir" }).click();
  await second.waitForTimeout(2_200);
  await second.getByRole("button", { name: "Send enquiry" }).click();
  await expect(second.getByRole("heading", { level: 1, name: "Thank you" })).toBeVisible();
  const [chosen] = await leadsOfPhone(page, otherPhone);
  expect(chosen?.trip.destinationName).toBe("Kashmir");
  expect((await leadsOf(page)).length).toBe(3);
  await visitor.close();
});
