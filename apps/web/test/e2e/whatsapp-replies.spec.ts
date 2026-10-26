// WhatsApp, part 2 (spec 12, journeys 3 and 5): staff answer within the window, the ticks follow the reports MSG91 sends, the
// lead's first reply time is set, a double tap sends once, a refused send says "Not sent" and Try again sends it; and a
// connection whose delivery reports stopped goes to "problem" (the console's banner, the inbox's sentence) and comes back by
// itself when a report arrives. MSG91 is the fake of support/fake-msg91.ts: nothing here reaches MSG91.
import { expect, signInToConsole, test } from "./support/console";
import { signInByEmail } from "./support/fixtures";
import {
  connectNumber,
  customerMessage,
  deliverWhatsapp,
  inAgency,
  newCustomerNumber,
  openNewChat,
  refuseNextSendTo,
  reportStatus,
  runHealthCheckNow,
  sentTo,
} from "./support/whatsapp";

test.use({
  // A fake microphone that needs no permission prompt (a tone, in the voice note test).
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
});

test("staff reply inside the window: the ticks follow MSG91's reports, a double tap sends once, a refused send can be tried again", async ({
  page,
  browser,
  superAdmin,
  agency,
}) => {
  test.setTimeout(360_000);
  await signInToConsole(page, superAdmin);
  const business = await connectNumber(page, agency.organizationId);
  const owner = await browser.newPage();
  await signInByEmail(owner, agency.owner);
  const customer = newCustomerNumber();
  const panel = await openNewChat(owner, business, customer, "Rahul Mehta", "Do you have a Kerala package?");

  // A double tap on Send is one message; the words are cleared once it is queued.
  const box = panel.getByRole("combobox", { name: "Message" });
  await box.fill("Yes, we have two. Sending details now.");
  await panel.getByRole("button", { name: "Send", exact: true }).dblclick();
  await expect(panel.getByText("Yes, we have two. Sending details now.")).toBeVisible();
  await expect(box).toHaveValue("");
  await expect(panel.getByRole("img", { name: "Sent" })).toBeVisible({ timeout: 60_000 });
  const first = await sentTo(customer);
  expect(first).toHaveLength(1);
  expect(first[0]).toMatchObject({ text: "Yes, we have two. Sending details now.", contentType: "text" });
  const wamid = first[0]?.wamid ?? "";

  // The chat no longer waits for an answer, and the lead's first reply time is set.
  await owner.goto("/inbox");
  // The list has loaded (the operator's test message may still wait there), and Rahul's chat is not among those waiting.
  await expect(
    owner.getByRole("list", { name: "Chats" }).or(owner.getByText("Every chat has been answered.")),
  ).toBeVisible({ timeout: 30_000 });
  await expect(owner.getByRole("link", { name: /Rahul Mehta/ })).toHaveCount(0);
  const firstReply = await inAgency(
    agency.organizationId,
    async (tx) => (await tx.lead.findFirstOrThrow()).firstReplyAt,
  );
  expect(firstReply).not.toBeNull();

  // The ticks follow the reports: delivered, then read.
  await owner.goto("/inbox");
  await owner.getByRole("radio", { name: "All" }).click();
  await owner
    .getByRole("link", { name: /Rahul Mehta/ })
    .first()
    .click();
  await expect(owner).toHaveURL(/\/inbox\/[0-9a-f-]{36}$/);
  const chat = owner.getByRole("region", { name: "Chat with Rahul Mehta" });
  await expect(chat.getByText("Yes, we have two. Sending details now.")).toBeVisible();
  await reportStatus({ business, customerNumber: customer, wamid }, "delivered");
  await expect(async () => {
    await owner.reload();
    await expect(chat.getByRole("img", { name: "Delivered" })).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 60_000 });
  await reportStatus({ business, customerNumber: customer, wamid }, "read");
  await expect(async () => {
    await owner.reload();
    await expect(chat.getByRole("img", { name: "Read" })).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 60_000 });

  // A send WhatsApp refuses says why and offers Try again, which sends it.
  await refuseNextSendTo(customer);
  await chat.getByRole("combobox", { name: "Message" }).fill("Here is the itinerary.");
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await expect(chat.getByText("Not sent: this number isn't on WhatsApp.")).toBeVisible({ timeout: 60_000 });
  await chat.getByRole("button", { name: "Try again" }).click();
  await expect(chat.getByText("Not sent: this number isn't on WhatsApp.")).toHaveCount(0, { timeout: 60_000 });
  await expect.poll(async () => (await sentTo(customer)).length, { timeout: 60_000 }).toBe(2);
  expect((await sentTo(customer))[1]).toMatchObject({ text: "Here is the itinerary." });

  // A file goes straight to storage, then to MSG91 as a link, with the words as its caption.
  await chat.locator('input[type="file"]').setInputFiles({
    name: "itinerary.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% a test itinerary\n%%EOF\n"),
  });
  await chat.getByRole("combobox", { name: "Message" }).fill("The itinerary, as a PDF.");
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(async () => (await sentTo(customer)).length, { timeout: 60_000 }).toBe(3);
  const document = (await sentTo(customer))[2];
  expect(document).toMatchObject({
    contentType: "document",
    fileName: "itinerary.pdf",
    caption: "The itinerary, as a PDF.",
  });
  expect(document?.url).toMatch(/^http/);
  await expect(chat.getByRole("link", { name: "Download itinerary.pdf" })).toBeVisible({ timeout: 60_000 });

  // A voice note: the fake microphone records, and the clip goes up through the file path and to MSG91 as audio.
  await chat.getByRole("button", { name: "Record a voice note" }).click();
  await expect(chat.getByRole("timer", { name: "Recording" })).toBeVisible();
  await owner.waitForTimeout(2_500);
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(async () => (await sentTo(customer)).length, { timeout: 60_000 }).toBe(4);
  const voice = (await sentTo(customer))[3];
  // Ogg Opus (as a voice note, with the flag) where the browser writes it or WebM that was remuxed; else MP4 audio, which WhatsApp
  // takes as an audio file. This Chromium writes MP4.
  expect(voice).toMatchObject({ contentType: "audio", fileName: expect.stringMatching(/^voice-note\.(ogg|m4a)$/) });
  expect(voice?.voice).toBe(voice?.fileName === "voice-note.ogg");
  await expect(chat.locator("audio")).toBeVisible({ timeout: 60_000 });

  // Once the window has closed (24 hours after the customer's last message), the box is replaced by a note.
  await inAgency(agency.organizationId, (tx) =>
    tx.whatsappConversation.updateMany({ data: { lastInboundAt: new Date(Date.now() - 25 * 3_600_000) } }),
  );
  await owner.reload();
  await expect(
    owner
      .getByRole("region", { name: "Chat with Rahul Mehta" })
      .getByText(/You can reply with free text only within 24 hours/),
  ).toBeVisible({ timeout: 30_000 });
  await expect(owner.getByRole("combobox", { name: "Message" })).toHaveCount(0);
  await owner.close();
});

test("a connection whose delivery reports stopped goes to problem, in the console and the inbox, and recovers by itself", async ({
  page,
  browser,
  superAdmin,
  agency,
}) => {
  test.setTimeout(360_000);
  await signInToConsole(page, superAdmin);
  const business = await connectNumber(page, agency.organizationId);
  const owner = await browser.newPage();
  await signInByEmail(owner, agency.owner);
  const customer = newCustomerNumber();
  const panel = await openNewChat(owner, business, customer, "Meera Iyer", "Can you quote Coorg for 3 nights?");
  await panel.getByRole("combobox", { name: "Message" }).fill("Sure, one moment.");
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  await expect(panel.getByRole("img", { name: "Sent" })).toBeVisible({ timeout: 60_000 });
  const wamid = (await sentTo(customer))[0]?.wamid ?? "";

  // MSG91 never reports on it: 25 minutes on, the next check calls the connection a problem.
  await inAgency(agency.organizationId, (tx) =>
    tx.whatsappMessage.updateMany({
      where: { wamid },
      data: { sentAt: new Date(Date.now() - 25 * 60_000) },
    }),
  );
  await runHealthCheckNow();

  await page.goto("/console/whatsapp");
  await expect(async () => {
    await page.reload();
    await expect(page.getByText(/No delivery reports from MSG91 for a connected number/)).toBeVisible({
      timeout: 4_000,
    });
  }).toPass({ timeout: 90_000 });
  await expect(async () => {
    await owner.goto("/inbox");
    await expect(owner.getByText("WhatsApp is having trouble: new messages may arrive late.")).toBeVisible({
      timeout: 4_000,
    });
  }).toPass({ timeout: 60_000 });

  // A report arrives, and the connection is well again.
  await reportStatus({ business, customerNumber: customer, wamid }, "delivered");
  await expect(async () => {
    await owner.goto("/inbox");
    await expect(owner.getByText("WhatsApp is having trouble: new messages may arrive late.")).toHaveCount(0, {
      timeout: 4_000,
    });
  }).toPass({ timeout: 60_000 });
  await page.reload();
  await expect(page.getByText(/No delivery reports from MSG91 for a connected number/)).toHaveCount(0);
  await owner.close();
});

test("the chat scrolls inside its own box: it opens at the newest message, keeps the reader's place, and offers New messages", async ({
  page,
  browser,
  superAdmin,
  agency,
}) => {
  test.setTimeout(360_000);
  await signInToConsole(page, superAdmin);
  const business = await connectNumber(page, agency.organizationId);
  const owner = await browser.newPage();
  await signInByEmail(owner, agency.owner);
  const customer = newCustomerNumber();
  const line = (index: number) =>
    `Message number ${String(index)} about a long trip plan for the whole family in December.`;
  expect(
    await deliverWhatsapp(
      Array.from({ length: 25 }, (_, index) =>
        customerMessage({ to: business, customerNumber: customer, name: "Anil Kapoor", text: line(index + 1) }),
      ),
    ),
  ).toBe(200);
  await expect(async () => {
    await owner.goto("/inbox");
    await owner
      .getByRole("link", { name: /Anil Kapoor/ })
      .first()
      .click({ timeout: 4_000 });
    await expect(owner.getByRole("list", { name: "Messages" }).getByText(line(25))).toBeVisible({ timeout: 6_000 });
  }).toPass({ timeout: 150_000 });
  // The messages' own scroll box: the first in the chat's region, before the contact panel's, and not the chat list's.
  const viewport = owner
    .getByRole("region", { name: "Chat with Anil Kapoor" })
    .locator('[data-slot="scroll-area-viewport"]')
    .first();
  const fromBottom = () =>
    viewport.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight);
  // The newest is in view, and the box is shorter than its messages.
  expect(await fromBottom()).toBeLessThan(5);
  expect(await viewport.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  // The reply box is still on screen, whatever the scroll.
  await viewport.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(owner.getByRole("combobox", { name: "Message" })).toBeInViewport();
  // A new message while reading higher up does not move the reader; it offers the way down.
  expect(await deliverWhatsapp([customerMessage({ to: business, customerNumber: customer, text: line(26) })])).toBe(
    200,
  );
  const more = owner.getByRole("button", { name: "New messages" });
  await expect(more).toBeVisible({ timeout: 60_000 });
  expect(await fromBottom()).toBeGreaterThan(200);
  await more.click();
  await expect(owner.getByRole("list", { name: "Messages" }).getByText(line(26))).toBeVisible();
  await expect(more).toHaveCount(0);
  expect(await fromBottom()).toBeLessThan(5);
  await owner.close();
});
