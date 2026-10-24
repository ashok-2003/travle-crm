// WhatsApp, part 1 (spec 12, journeys 1 and 2): a super admin records the agency's number in the console, sends the test
// message, sees "Webhook received" and marks it connected, and the agency sees its inbox; then a message from a number nobody
// knows makes a lead with its source and an owner, the chat shows in the inbox and on the lead's page, and a photo from the
// customer arrives and shows. A caller without both secrets gets a bare 401 and changes nothing.
import { expect, signInToConsole, test } from "./support/console";
import { signInByEmail } from "./support/fixtures";
import { MSG91_E2E } from "./support/fake-msg91";
import { customerMessage, deliverWhatsapp, newCustomerNumber, recordNumber } from "./support/whatsapp";

test("a super admin connects the agency's number, then a message becomes a lead with its chat and photo", async ({
  page,
  browser,
  superAdmin,
  agency,
}) => {
  test.setTimeout(240_000);
  const photoUrl = process.env.E2E_MSG91_PHOTO_URL;
  if (!photoUrl) throw new Error("E2E_MSG91_PHOTO_URL is not set");

  // Journey 1: record the number, see the webhook arrive, mark it connected.
  await signInToConsole(page, superAdmin);
  await recordNumber(page, agency.organizationId);
  const group = page.getByRole("region", { name: "WhatsApp" });
  await expect(group.getByRole("button", { name: "Mark connected" })).toBeDisabled();

  const customer = newCustomerNumber();
  // A stranger without the secrets is refused with nothing stored; the right secrets are answered 200.
  expect(
    await deliverWhatsapp([customerMessage({ customerNumber: customer, text: "x" })], { key: "wrong".repeat(10) }),
  ).toBe(401);
  expect(
    await deliverWhatsapp([customerMessage({ customerNumber: customer, text: "x" })], { token: "wrong".repeat(8) }),
  ).toBe(401);
  expect(await deliverWhatsapp([customerMessage({ customerNumber: customer, text: "test message" })])).toBe(200);
  // While the number is being set up the message only proves the webhook works: no lead is made.
  await expect(group.getByText(/Webhook received/)).toBeVisible({ timeout: 60_000 });
  await group.getByRole("button", { name: "Mark connected" }).click();
  await expect(group.getByText("Connected", { exact: true })).toBeVisible({ timeout: 30_000 });

  // The agency sees its inbox.
  const owner = await browser.newPage();
  await signInByEmail(owner, agency.owner);
  await owner.goto("/inbox");
  await expect(owner.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();
  await expect(owner.getByText("Every chat has been answered.")).toBeVisible();

  // Journey 2: a message from a number nobody knows.
  expect(
    await deliverWhatsapp([
      customerMessage({ customerNumber: customer, name: "Priya Sharma", text: "Hi, Goa trip for 4 in December?" }),
    ]),
  ).toBe(200);
  await owner.goto("/leads?view=everyone");
  await expect(owner.getByRole("main").getByRole("link", { name: /Priya Sharma/ })).toBeVisible({ timeout: 60_000 });
  expect(
    await deliverWhatsapp([
      customerMessage({ customerNumber: customer, contentType: "image", url: photoUrl, caption: "Our passports" }),
    ]),
  ).toBe(200);

  await owner.goto("/inbox");
  const chat = owner.getByRole("link", { name: /Priya Sharma/ });
  await expect(chat).toBeVisible({ timeout: 60_000 });
  await chat.click();
  const panel = owner.getByRole("region", { name: "Chat with Priya Sharma" });
  await expect(panel.getByText("Hi, Goa trip for 4 in December?")).toBeVisible();
  await expect(panel.getByText("Our passports")).toBeVisible();
  // The photo is copied into our storage and shown from there, not from MSG91's link.
  const image = panel.getByRole("img", { name: "Our passports" });
  await expect(image).toBeVisible({ timeout: 60_000 });
  expect(await image.getAttribute("src")).not.toContain(MSG91_E2E.integratedNumber);
  expect(await image.getAttribute("src")).not.toContain("/media/photo.png");

  // The lead: source, and the same chat on its page.
  await panel.getByRole("link", { name: "Priya Sharma" }).click();
  const ownerCard = owner.getByRole("region", { name: "Owner and source" });
  await expect(ownerCard.getByText("WhatsApp")).toBeVisible();
  const section = owner.getByRole("region", { name: "Chat with Priya Sharma" });
  await expect(section.getByText("Hi, Goa trip for 4 in December?")).toBeVisible();
  await owner.close();
});
