// The sales inbox's everyday tools (sales inbox spec 5 and 6; owner decisions of 2026-10-26), on a phone and a desktop: a
// customer writes, the Owner tags the chat, answers with a quick reply typed after "/", snoozes the chat so it leaves the
// list, and a new message from the customer brings it back at once. MSG91 is the fake of support/fake-msg91.ts.
import { expect, signInToConsole, test } from "./support/console";
import { signInByEmail } from "./support/fixtures";
import {
  connectNumber,
  customerMessage,
  deliverWhatsapp,
  inAgency,
  newCustomerNumber,
  openContactDetails,
  openNewChat,
  sentTo,
} from "./support/whatsapp";

// A step that finds nothing fails in seconds, not at the end of the test's time.
test.use({ actionTimeout: 20_000 });

test("tag a chat, answer with a quick reply, snooze it, and a new message wakes it", async ({
  page,
  browser,
  superAdmin,
  agency,
}) => {
  test.setTimeout(420_000);
  await signInToConsole(page, superAdmin);
  const business = await connectNumber(page, agency.organizationId);
  // The agency's saved answer, as Settings, WhatsApp writes it.
  await inAgency(agency.organizationId, (tx) =>
    tx.inboxQuickReply.create({
      data: {
        shortcut: "price",
        title: "Price list",
        body: "Hi {name}, our Kerala packages start at ₹30,000 a person.",
      },
    }),
  );
  const owner = await browser.newPage();
  await signInByEmail(owner, agency.owner);
  const customer = newCustomerNumber();
  const panel = await openNewChat(owner, business, customer, "Rahul Mehta", "Do you have a Kerala package?");

  // Tag it: the contact details are a side panel that a wide screen shows already, and a sheet that a phone opens from the header.
  const newTag = owner.getByRole("textbox", { name: "New tag" });
  if (!(await newTag.isVisible())) await openContactDetails(owner, panel);
  await newTag.fill("Hot");
  await owner.getByRole("button", { name: "Add the tag" }).click();

  await expect(
    owner.getByRole("toolbar", { name: "Tags" }).getByRole("button", { name: "Hot", pressed: true }),
  ).toBeVisible();
  // On a phone the details are a sheet over the chat: close it to get back to the messages.
  const sheet = owner.getByRole("dialog");
  if (await sheet.isVisible()) await sheet.getByRole("button", { name: "Close" }).click();

  // A quick reply: "/pri" opens the list, Enter puts the answer in the box with the customer's first name in its blank.
  const box = panel.getByRole("combobox", { name: "Message" });
  await box.fill("/pri");
  await expect(panel.getByRole("option", { name: /Price list/ })).toBeVisible();
  await box.press("Enter");
  await expect(box).toHaveValue("Hi Rahul, our Kerala packages start at ₹30,000 a person.");
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  await expect(panel.getByText("Hi Rahul, our Kerala packages start at ₹30,000 a person.")).toBeVisible();
  await expect.poll(async () => (await sentTo(customer)).length, { timeout: 60_000 }).toBe(1);
  expect((await sentTo(customer))[0]).toMatchObject({
    text: "Hi Rahul, our Kerala packages start at ₹30,000 a person.",
  });

  // Snooze it for an hour: it leaves the lists and shows under Snoozed.
  await panel.getByRole("button", { name: "More for this chat" }).click();
  await owner.getByRole("menuitem", { name: "Snooze" }).click();
  await owner.getByRole("menuitem", { name: /For an hour/ }).click();
  await expect(owner.getByText(/Snoozed until/)).toBeVisible();
  await owner.goto("/inbox");
  await expect(
    owner.getByRole("list", { name: "Chats" }).or(owner.getByText("Every chat has been answered.")),
  ).toBeVisible({ timeout: 30_000 });
  await owner
    .getByRole("button", { name: /^All/ })
    .or(owner.getByRole("radio", { name: /^All/ }))
    .first()
    .click();
  await expect(owner.getByRole("link", { name: /Rahul Mehta/ })).toHaveCount(0);

  // The customer writes again, long before the hour is up: the chat is back in the list with the new message.
  expect(
    await deliverWhatsapp([customerMessage({ to: business, customerNumber: customer, text: "Is Munnar included?" })]),
  ).toBe(200);
  await expect(async () => {
    await owner.reload();
    await expect(owner.getByRole("link", { name: /Rahul Mehta/ }).first()).toBeVisible({ timeout: 4_000 });
    await expect(owner.getByText("Is Munnar included?").first()).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 60_000 });
  const stillSnoozed = await inAgency(agency.organizationId, (tx) =>
    tx.whatsappConversation.findFirstOrThrow({ select: { snoozedUntil: true } }),
  );
  expect(stillSnoozed.snoozedUntil).toBeNull();
  await owner.close();
});
