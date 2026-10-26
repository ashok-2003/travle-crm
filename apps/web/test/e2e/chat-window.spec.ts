// The chat window, as WhatsApp's (chat v2, part 2), on a phone and a desktop against the fake MSG91: a customer's photos open
// in a viewer that zooms, goes to the next and closes; a pasted picture waits in the box and is sent with its progress shown;
// a reply quotes a customer's message, and the customer's reply to ours shows its quote; a half-written message is still
// there after another chat was opened.
import { expect, signInToConsole, test } from "./support/console";
import { signInByEmail } from "./support/fixtures";
import {
  connectNumber,
  customerMessage,
  deliverWhatsapp,
  inAgency,
  newCustomerNumber,
  openNewChat,
  sentTo,
} from "./support/whatsapp";

// A step that finds nothing fails in seconds, not at the end of the test's time.
test.use({ actionTimeout: 20_000 });

test("a customer's photos open in a viewer: zoom, next, close", async ({ page, browser, superAdmin, agency }) => {
  test.setTimeout(420_000);
  const photoUrl = process.env.E2E_MSG91_PHOTO_URL;
  if (!photoUrl) throw new Error("E2E_MSG91_PHOTO_URL is not set");
  await signInToConsole(page, superAdmin);
  const business = await connectNumber(page, agency.organizationId);
  const owner = await browser.newPage();
  await signInByEmail(owner, agency.owner);
  const customer = newCustomerNumber();
  const chat = await openNewChat(owner, business, customer, "Meera Rao", "Here are the houseboats");
  for (const caption of ["Houseboat one", "Houseboat two"]) {
    expect(
      await deliverWhatsapp([
        customerMessage({ to: business, customerNumber: customer, contentType: "image", url: photoUrl, caption }),
      ]),
    ).toBe(200);
  }
  // The worker copies each photo into storage; each then shows as a picture that can be opened.
  await expect(chat.getByRole("button", { name: "Open the photo" })).toHaveCount(2, { timeout: 90_000 });

  await chat.getByRole("button", { name: "Open the photo" }).first().click();
  const viewer = owner.getByRole("dialog");
  await expect(viewer.getByText("1 of 2")).toBeVisible();
  await expect(viewer.getByText("Houseboat one")).toBeVisible();
  const picture = viewer.getByRole("img", { name: "Houseboat one" });
  await expect(picture).toBeVisible();
  await viewer.getByRole("button", { name: "Zoom in" }).click();
  await expect(picture).toHaveCSS("transform", /matrix\(1\.5/);
  await viewer.getByRole("button", { name: "Next" }).click();
  await expect(viewer.getByText("2 of 2")).toBeVisible();
  await expect(viewer.getByText("Houseboat two")).toBeVisible();
  await owner.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
  await owner.close();
});

test("a pasted picture waits in the box and is sent, with its progress shown", async ({
  page,
  browser,
  superAdmin,
  agency,
}) => {
  test.setTimeout(420_000);
  await signInToConsole(page, superAdmin);
  const business = await connectNumber(page, agency.organizationId);
  const owner = await browser.newPage();
  await signInByEmail(owner, agency.owner);
  const customer = newCustomerNumber();
  const chat = await openNewChat(owner, business, customer, "Meera Rao", "Can you send the plan?");

  // Storage answers slowly, so the send can be seen going up.
  await owner.route(
    (url) => url.pathname.includes("whatsapp"),
    async (route) => {
      if (route.request().method() === "PUT") await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.continue();
    },
  );
  const box = chat.getByRole("combobox", { name: "Message" });
  await box.click();
  await box.evaluate((element) => {
    const bytes = Uint8Array.from(
      atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
      (character) => character.charCodeAt(0),
    );
    const data = new DataTransfer();
    data.items.add(new File([bytes], "plan.png", { type: "image/png" }));
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(chat.getByText("plan.png")).toBeVisible();
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await expect(chat.getByRole("listitem", { name: "Sending" })).toBeVisible();
  await expect.poll(async () => (await sentTo(customer)).length, { timeout: 60_000 }).toBe(1);
  expect((await sentTo(customer))[0]).toMatchObject({ contentType: "image", fileName: "plan.png" });
  await expect(chat.getByRole("listitem", { name: "Sending" })).toHaveCount(0);
  await owner.close();
});

test("a reply quotes a customer's message, and the customer's answer to ours shows its quote", async ({
  page,
  browser,
  superAdmin,
  agency,
}) => {
  test.setTimeout(420_000);
  await signInToConsole(page, superAdmin);
  const business = await connectNumber(page, agency.organizationId);
  const owner = await browser.newPage();
  await signInByEmail(owner, agency.owner);
  const customer = newCustomerNumber();
  const chat = await openNewChat(owner, business, customer, "Meera Rao", "Is Goa open in June?");
  // The id WhatsApp knows the customer's message by: what our reply must name as the message it answers.
  const asked = (
    await inAgency(agency.organizationId, (tx) =>
      tx.whatsappMessage.findFirstOrThrow({ where: { direction: "in", body: "Is Goa open in June?" } }),
    )
  ).wamid;
  if (asked === null) throw new Error("the customer's message has no WhatsApp id");

  await chat.getByRole("button", { name: "More for this message" }).first().click({ force: true });
  await owner.getByRole("menuitem", { name: "Reply" }).click();
  await expect(chat.getByText("Replying to Meera Rao")).toBeVisible();
  await chat.getByRole("combobox", { name: "Message" }).fill("Yes, it is.");
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(async () => (await sentTo(customer)).length, { timeout: 60_000 }).toBe(1);
  const [ours] = await sentTo(customer);
  expect(ours).toMatchObject({ text: "Yes, it is.", replyTo: asked });
  // Our bubble shows the quote, and the box has let go of it.
  await expect(chat.getByRole("button", { name: "Go to the message from Meera Rao" })).toBeVisible();
  await expect(chat.getByText("Replying to Meera Rao")).toHaveCount(0);

  // The customer answers ours, naming it as the message they reply to.
  expect(
    await deliverWhatsapp([
      customerMessage({ to: business, customerNumber: customer, text: "Great, thanks", replyMsgId: ours?.wamid ?? "" }),
    ]),
  ).toBe(200);
  const theirQuote = chat.getByRole("button", { name: /Go to the message from/ }).last();
  await expect(theirQuote).toContainText("Yes, it is.", { timeout: 60_000 });
  await owner.close();
});

test("a half-written message is still there after another chat was opened", async ({
  page,
  browser,
  superAdmin,
  agency,
}) => {
  test.setTimeout(420_000);
  await signInToConsole(page, superAdmin);
  const business = await connectNumber(page, agency.organizationId);
  const owner = await browser.newPage();
  await signInByEmail(owner, agency.owner);
  const first = await openNewChat(owner, business, newCustomerNumber(), "Meera Rao", "Quote for Kerala?");
  await first.getByRole("combobox", { name: "Message" }).fill("Kerala for four, from");
  await openNewChat(owner, business, newCustomerNumber(), "Amit Shah", "Goa in December");
  await expect(owner.getByRole("combobox", { name: "Message" })).toHaveValue("");
  await owner.goto("/inbox");
  await owner
    .getByRole("link", { name: /Meera Rao/ })
    .first()
    .click();
  await expect(owner.getByRole("combobox", { name: "Message" })).toHaveValue("Kerala for four, from");
  await owner.close();
});
