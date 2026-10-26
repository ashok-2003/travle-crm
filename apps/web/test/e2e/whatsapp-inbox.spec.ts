// WhatsApp, part 1 (spec 12, journeys 1 and 2): a super admin records the agency's number in the console, sends the test
// message, sees "Webhook received" and marks it connected, and the agency sees its inbox; then a message from a number nobody
// knows makes a lead with its source and an owner, the chat shows in the inbox and on the lead's page, and a photo from the
// customer arrives and shows. A caller without both secrets gets a bare 401 and changes nothing.
import { expect, signInToConsole, test } from "./support/console";
import { signInByEmail } from "./support/fixtures";
import {
  customerMessage,
  deliverWhatsapp,
  newBusinessNumber,
  newCustomerNumber,
  recordNumber,
} from "./support/whatsapp";

test("a super admin connects the agency's number, then a message becomes a lead with its chat and photo", async ({
  page,
  browser,
  superAdmin,
  agency,
}) => {
  test.setTimeout(360_000);
  const photoUrl = process.env.E2E_MSG91_PHOTO_URL;
  if (!photoUrl) throw new Error("E2E_MSG91_PHOTO_URL is not set");

  // Journey 1: record the number, see the webhook arrive, mark it connected.
  await signInToConsole(page, superAdmin);
  const business = newBusinessNumber();
  await recordNumber(page, agency.organizationId, business);
  const group = page.getByRole("region", { name: "WhatsApp" });
  await expect(group.getByRole("button", { name: "Mark connected" })).toBeDisabled();

  const customer = newCustomerNumber();
  // The operator's own phone for the test message: a message still waiting in the queue when the number is marked connected
  // would become a lead, and it must not be the customer's.
  const operator = newCustomerNumber();
  // A stranger without the secrets is refused with nothing stored; the right secrets are answered 200.
  expect(
    await deliverWhatsapp([customerMessage({ to: business, customerNumber: customer, text: "x" })], {
      key: "wrong".repeat(10),
    }),
  ).toBe(401);
  expect(
    await deliverWhatsapp([customerMessage({ to: business, customerNumber: customer, text: "x" })], {
      token: "wrong".repeat(8),
    }),
  ).toBe(401);
  // The number's route is made by a listener of the worker, a moment after it was recorded: the test message is sent until
  // the console shows it arrived, as the operator would send it again.
  await expect(async () => {
    expect(
      await deliverWhatsapp([customerMessage({ to: business, customerNumber: operator, text: "test message" })]),
    ).toBe(200);
    await page.reload();
    await expect(group.getByText(/Webhook received/)).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 150_000 });
  await group.getByRole("button", { name: "Mark connected" }).click();
  await expect(group.getByText("Connected", { exact: true })).toBeVisible({ timeout: 30_000 });

  // The agency sees its inbox.
  const owner = await browser.newPage();
  await signInByEmail(owner, agency.owner);
  await owner.goto("/inbox");
  await expect(owner.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();
  // The list has loaded (the operator's test message may still wait in it, if one was delivered after Mark connected).
  await expect(
    owner.getByRole("list", { name: "Chats" }).or(owner.getByText("Every chat has been answered.")),
  ).toBeVisible();

  // Journey 2: a message from a number nobody knows.
  expect(
    await deliverWhatsapp([
      customerMessage({
        to: business,
        customerNumber: customer,
        name: "Priya Sharma",
        text: "Hi, Goa trip for 4 in December?",
      }),
    ]),
  ).toBe(200);
  await owner.goto("/leads?view=everyone");
  await expect(async () => {
    await owner.reload();
    await expect(owner.getByRole("link", { name: "Priya Sharma" }).first()).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 60_000 });
  expect(
    await deliverWhatsapp([
      customerMessage({
        to: business,
        customerNumber: customer,
        contentType: "image",
        url: photoUrl,
        caption: "Our passports",
      }),
    ]),
  ).toBe(200);

  // Each try starts from the list: on a phone a chat is a page of its own, whose title is a link to the same name.
  await expect(async () => {
    await owner.goto("/inbox");
    await owner
      .getByRole("link", { name: /Priya Sharma/ })
      .first()
      .click({ timeout: 4_000 });
    await expect(owner.getByRole("region", { name: "Chat with Priya Sharma" }).getByText("Our passports")).toBeVisible({
      timeout: 6_000,
    });
  }).toPass({ timeout: 150_000 });
  const panel = owner.getByRole("region", { name: "Chat with Priya Sharma" });
  // The messages list only: the contact panel beside it shows the lead's timeline, which holds the same first words.
  await expect(
    panel.getByRole("list", { name: "Messages" }).getByText("Hi, Goa trip for 4 in December?"),
  ).toBeVisible();
  // The photo is copied into our storage and shown from there, not from MSG91's link.
  const image = panel.getByRole("img", { name: "Our passports" });
  await expect(image).toBeVisible({ timeout: 60_000 });
  expect(await image.getAttribute("src")).not.toContain("/media/photo.png");

  // The lead: source, and the same chat on its page.
  // The lead is a link in the contact details: beside the chat on a wide screen, a sheet from the header on a phone.
  const openLead = owner.getByRole("link", { name: "Open the lead" }).first();
  if (!(await openLead.isVisible())) await panel.getByRole("button", { name: "Contact and lead details" }).click();
  await openLead.click();
  const ownerCard = owner.getByRole("region", { name: "Owner and source" });
  await expect(ownerCard.getByText("WhatsApp", { exact: true })).toBeVisible();
  const section = owner.getByRole("region", { name: "Chat with Priya Sharma" });
  await expect(
    section.getByRole("list", { name: "Messages" }).getByText("Hi, Goa trip for 4 in December?"),
  ).toBeVisible();
  await owner.close();
});
