// WhatsApp, part 3 (spec 12, journey 4): the agency writes a template and, once WhatsApp approves it, staff send it to a
// customer whose 24-hour window has closed, with the blanks filled; a refused send says "Not sent" and Try again sends it; a
// rejected template shows WhatsApp's reason and can be edited and sent again; a customer who writes STOP gets no template.
// MSG91 is the fake of support/fake-msg91.ts.
import type { Page } from "@playwright/test";
import { expect, signInToConsole, test } from "./support/console";
import { signInByEmail } from "./support/fixtures";
import {
  connectNumber,
  customerMessage,
  decideTemplate,
  deliverWhatsapp,
  inAgency,
  newCustomerNumber,
  refuseNextSendTo,
  sentTo,
} from "./support/whatsapp";

async function newTemplate(owner: Page, name: string, body: string, samples: string[], sources: string[] = []) {
  await owner.getByRole("button", { name: "New template" }).click();
  const dialog = owner.getByRole("dialog", { name: "New template" });
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  await dialog.getByLabel("The message").fill(body);
  for (const [index, sample] of samples.entries()) {
    await dialog.getByLabel(`An example for blank ${String(index + 1)}`).fill(sample);
  }
  for (const [index, source] of sources.entries()) {
    await dialog.getByRole("combobox", { name: `Fill blank ${String(index + 1)} from` }).click();
    await owner.getByRole("option", { name: source }).click();
  }
  await dialog.getByRole("button", { name: "Send for approval" }).click();
  await expect(dialog).toHaveCount(0, { timeout: 60_000 });
}

test("templates: written, approved, sent after the window closed, tried again, rejected and edited, and STOP", async ({
  page,
  browser,
  superAdmin,
  agency,
}) => {
  test.setTimeout(480_000);
  await signInToConsole(page, superAdmin);
  const business = await connectNumber(page, agency.organizationId);
  const owner = await browser.newPage();
  await signInByEmail(owner, agency.owner);

  // Writing templates: Meta's rules are checked first, then it waits for approval.
  await owner.goto("/settings/whatsapp");
  await owner.getByRole("button", { name: "New template" }).click();
  const dialog = owner.getByRole("dialog", { name: "New template" });
  await dialog.getByLabel("Name", { exact: true }).fill("bad_start");
  await dialog.getByLabel("The message").fill("{{1}} is your trip");
  await dialog.getByLabel("An example for blank 1").fill("Goa");
  await dialog.getByRole("button", { name: "Send for approval" }).click();
  await expect(dialog.getByText("A blank can't be the very first or last thing in the message.")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await newTemplate(
    owner,
    "booking_update",
    "Hello {{1}}, your trip to {{2}} is confirmed.",
    ["Priya", "Goa"],
    ["The customer's name", "The destination"],
  );
  await newTemplate(owner, "festive_note", "Hello {{1}}, our festive offers are here.", ["Priya"]);
  await expect(owner.getByRole("row", { name: /booking_update/ }).getByText("Waiting for approval")).toBeVisible({
    timeout: 30_000,
  });

  await decideTemplate(business, "booking_update", "approved");
  await decideTemplate(business, "festive_note", "rejected", "Too promotional for a utility message");
  await owner.getByRole("button", { name: "Refresh status" }).click();
  await expect(owner.getByRole("row", { name: /booking_update/ }).getByText("Approved")).toBeVisible({
    timeout: 30_000,
  });
  const rejected = owner.getByRole("row", { name: /festive_note/ });
  await expect(rejected.getByText("WhatsApp says: Too promotional for a utility message")).toBeVisible();

  // The language is named, not coded.
  await expect(owner.getByRole("row", { name: /booking_update/ }).getByText("English")).toBeVisible();

  // Edit and send again.
  await rejected.getByRole("button", { name: "Edit and send again" }).click();
  const edit = owner.getByRole("dialog", { name: "Edit the template" });
  await edit.getByLabel("The message").fill("Hello {{1}}, your booking details are ready.");
  await edit.getByRole("button", { name: "Send again" }).click();
  await expect(edit).toHaveCount(0, { timeout: 60_000 });
  await expect(owner.getByRole("row", { name: /festive_note/ }).getByText("Waiting for approval")).toBeVisible({
    timeout: 30_000,
  });

  // A customer writes; a day later the window is closed and a template is the way to answer.
  const customer = newCustomerNumber();
  expect(
    await deliverWhatsapp([
      customerMessage({
        to: business,
        customerNumber: customer,
        name: "Rahul Mehta",
        text: "Is my booking confirmed?",
      }),
    ]),
  ).toBe(200);
  await expect(async () => {
    await owner.goto("/inbox");
    await owner
      .getByRole("link", { name: /Rahul Mehta/ })
      .first()
      .click({ timeout: 4_000 });
    await expect(
      owner.getByRole("region", { name: "Chat with Rahul Mehta" }).getByText("Is my booking confirmed?"),
    ).toBeVisible({ timeout: 6_000 });
  }).toPass({ timeout: 150_000 });
  await inAgency(agency.organizationId, (tx) =>
    tx.whatsappConversation.updateMany({ data: { lastInboundAt: new Date(Date.now() - 25 * 3_600_000) } }),
  );
  await owner.reload();
  const chat = owner.getByRole("region", { name: "Chat with Rahul Mehta" });
  await expect(chat.getByText(/You can reply with free text only within 24 hours/)).toBeVisible({ timeout: 30_000 });
  await expect(chat.getByRole("textbox", { name: "Message" })).toHaveCount(0);

  await refuseNextSendTo(customer);
  await chat.getByRole("button", { name: "Send a template" }).click();
  const send = owner.getByRole("dialog", { name: "Send a template" });
  await send.getByRole("radio", { name: /booking_update/ }).click();
  await expect(send.getByLabel("Customer's name")).toHaveValue("Rahul");
  await send.getByLabel("Destination", { exact: true }).fill("Kerala");
  await expect(send.getByLabel("The message as it will read")).toHaveText(
    "Hello Rahul, your trip to Kerala is confirmed.",
  );
  await send.getByRole("button", { name: "Send", exact: true }).click();
  await expect(send).toHaveCount(0, { timeout: 60_000 });
  await expect(chat.getByText("Hello Rahul, your trip to Kerala is confirmed.")).toBeVisible({ timeout: 60_000 });
  await expect(chat.getByText("Not sent: this number isn't on WhatsApp.")).toBeVisible({ timeout: 60_000 });
  await chat.getByRole("button", { name: "Try again" }).click();
  await expect.poll(async () => (await sentTo(customer)).length, { timeout: 60_000 }).toBe(1);
  expect((await sentTo(customer))[0]?.template).toEqual({
    name: "booking_update",
    language: "en",
    parameters: ["Rahul", "Kerala"],
  });

  // STOP: no template can be sent to them any more.
  expect(await deliverWhatsapp([customerMessage({ to: business, customerNumber: customer, text: "STOP" })])).toBe(200);
  await inAgency(agency.organizationId, (tx) =>
    tx.whatsappConversation.updateMany({ data: { lastInboundAt: new Date(Date.now() - 25 * 3_600_000) } }),
  );
  await expect(async () => {
    await owner.reload();
    await expect(chat.getByText("Asked to stop WhatsApp messages.").first()).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 60_000 });
  await expect(chat.getByRole("button", { name: "Send a template" })).toHaveCount(0);
  await owner.close();
});
