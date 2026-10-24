// The visual audit's WhatsApp templates (part 3): the settings table with an approved, a waiting and a rejected template, the New
// template form with a blank, a chat whose 24-hour window has closed, and the Send a template dialog with its preview.
import { expect, signInToConsole, test } from "../support/console";
import { signInByEmail } from "../support/fixtures";
import {
  connectNumber,
  customerMessage,
  decideTemplate,
  deliverWhatsapp,
  inAgency,
  newCustomerNumber,
} from "../support/whatsapp";
import { screenshotsOnly, shoot } from "./camera";

test.beforeEach(screenshotsOnly);

test("WhatsApp templates: the table, the form, a closed window and the send dialog", async ({
  page,
  browser,
  superAdmin,
  agency,
}) => {
  test.setTimeout(600_000);
  await signInToConsole(page, superAdmin);
  const business = await connectNumber(page, agency.organizationId);
  const owner = await browser.newPage();
  await signInByEmail(owner, agency.owner);
  await owner.goto("/settings/whatsapp");

  const create = async (name: string, body: string, samples: string[], sources: string[]) => {
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
    return dialog;
  };
  const form = await create(
    "booking_update",
    "Hello {{1}}, your trip to {{2}} is confirmed.",
    ["Priya", "Goa"],
    ["The customer's name", "The destination"],
  );
  await shoot(owner, "whatsapp-template-new");
  await form.getByRole("button", { name: "Send for approval" }).click();
  await expect(form).toHaveCount(0, { timeout: 60_000 });
  const second = await create("festive_note", "Hello {{1}}, our festive offers are here.", ["Priya"], []);
  await second.getByRole("button", { name: "Send for approval" }).click();
  await expect(second).toHaveCount(0, { timeout: 60_000 });
  const third = await create("visa_help", "Hello {{1}}, we can help with your visa.", ["Priya"], []);
  await third.getByRole("button", { name: "Send for approval" }).click();
  await expect(third).toHaveCount(0, { timeout: 60_000 });
  await decideTemplate(business, "booking_update", "approved");
  await decideTemplate(business, "festive_note", "rejected", "Too promotional for a utility message");
  await owner.getByRole("button", { name: "Refresh status" }).click();
  await expect(owner.getByRole("row", { name: /booking_update/ }).getByText("Approved")).toBeVisible({
    timeout: 30_000,
  });
  await shoot(owner, "whatsapp-templates");

  const customer = newCustomerNumber();
  await deliverWhatsapp([
    customerMessage({ to: business, customerNumber: customer, name: "Rahul Mehta", text: "Is my booking confirmed?" }),
  ]);
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
  await expect(chat.getByRole("button", { name: "Send a template" })).toBeVisible({ timeout: 30_000 });
  await shoot(owner, "whatsapp-window-closed");
  await chat.getByRole("button", { name: "Send a template" }).click();
  const send = owner.getByRole("dialog", { name: "Send a template" });
  await send.getByRole("radio", { name: /booking_update/ }).click();
  await send.getByLabel("Value for blank 2").fill("Kerala");
  await shoot(owner, "whatsapp-send-template");
  await owner.close();
});
