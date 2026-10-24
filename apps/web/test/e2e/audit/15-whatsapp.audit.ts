// The visual audit's WhatsApp screens (part 2): the console's numbers and an organization's WhatsApp group, the inbox's list
// (a named chat, a number with no name, the Reply due mark), a chat with a photo, ticks, a message that was not sent and the
// reply box, and the lead's page with the same chat. The agency's chats are made through the product against the fake MSG91.
import { expect, signInToConsole, test } from "../support/console";
import { signInByEmail } from "../support/fixtures";
import {
  connectNumber,
  customerMessage,
  deliverWhatsapp,
  newCustomerNumber,
  refuseNextSendTo,
  reportStatus,
  sentTo,
} from "../support/whatsapp";
import { screenshotsOnly, shoot } from "./camera";

test.beforeEach(screenshotsOnly);

test("WhatsApp: the console's numbers, the inbox, a chat with its reply box, and the lead's page", async ({
  page,
  browser,
  superAdmin,
  agency,
}) => {
  test.setTimeout(600_000);
  const photoUrl = process.env.E2E_MSG91_PHOTO_URL;
  if (!photoUrl) throw new Error("E2E_MSG91_PHOTO_URL is not set");
  await signInToConsole(page, superAdmin);
  const business = await connectNumber(page, agency.organizationId);
  await shoot(page, "whatsapp-console-organization");
  await page.goto("/console/whatsapp");
  await expect(page.getByRole("link", { name: agency.name }).first()).toBeVisible();
  await shoot(page, "whatsapp-console-list");

  const owner = await browser.newPage();
  await signInByEmail(owner, agency.owner);
  const customer = newCustomerNumber();
  const stranger = newCustomerNumber();
  await deliverWhatsapp([
    customerMessage({
      to: business,
      customerNumber: customer,
      name: "Rahul Mehta",
      text: "Do you have a Kerala package?",
    }),
  ]);
  await expect(async () => {
    await owner.goto("/inbox");
    await expect(owner.getByRole("link", { name: /Rahul Mehta/ })).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 90_000 });
  await deliverWhatsapp([customerMessage({ to: business, customerNumber: stranger, text: "Hello, are you there?" })]);
  await expect(async () => {
    await owner.goto("/inbox");
    await expect(owner.getByText("Hello, are you there?")).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 90_000 });
  await shoot(owner, "whatsapp-inbox-list");

  // Rahul's chat: a first answer that was read, a photo from him, an answer that WhatsApp refused, and a new question.
  await owner.getByRole("link", { name: /Rahul Mehta/ }).click();
  const chat = owner.getByRole("region", { name: "Chat with Rahul Mehta" });
  await chat.getByRole("textbox", { name: "Message" }).fill("Yes, we have two Kerala packages. Sending details now.");
  await chat.getByRole("button", { name: "Send" }).click();
  await expect(chat.getByRole("img", { name: "Sent" })).toBeVisible({ timeout: 60_000 });
  const wamid = (await sentTo(customer))[0]?.wamid ?? "";
  await reportStatus({ business, customerNumber: customer, wamid }, "delivered");
  await reportStatus({ business, customerNumber: customer, wamid }, "read");
  await deliverWhatsapp([
    customerMessage({
      to: business,
      customerNumber: customer,
      contentType: "image",
      url: photoUrl,
      caption: "Our passports",
    }),
  ]);
  await expect(chat.getByRole("img", { name: "Our passports" })).toBeVisible({ timeout: 90_000 });
  await refuseNextSendTo(customer);
  await chat.getByRole("textbox", { name: "Message" }).fill("Thank you. I will send the quote this evening.");
  await chat.getByRole("button", { name: "Send" }).click();
  await expect(chat.getByRole("button", { name: "Try again" })).toBeVisible({ timeout: 60_000 });
  await deliverWhatsapp([
    customerMessage({ to: business, customerNumber: customer, text: "Also, is a houseboat night included?" }),
  ]);
  await expect(chat.getByText("Also, is a houseboat night included?")).toBeVisible({ timeout: 60_000 });
  await expect(chat.getByRole("img", { name: "Read" })).toBeVisible({ timeout: 60_000 });
  await chat.getByRole("textbox", { name: "Message" }).fill("Yes, one night on a houseboat is included.");
  await shoot(owner, "whatsapp-inbox-chat");

  // The lead's page, with the same chat.
  await chat.getByRole("link", { name: "Rahul Mehta" }).click();
  const section = owner.getByRole("region", { name: "Chat with Rahul Mehta" });
  await expect(section.getByText("Our passports")).toBeVisible({ timeout: 60_000 });
  await shoot(owner, "whatsapp-lead-section");
  await owner.close();
});
