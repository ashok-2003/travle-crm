// The visual audit's WhatsApp chat (part 3d): a long chat in a box of its own with the reply box pinned below it, the emoji
// picker open (computers only), and a voice note being recorded (the browser's fake microphone).
import { expect, signInToConsole, test } from "../support/console";
import { signInByEmail } from "../support/fixtures";
import { connectNumber, customerMessage, deliverWhatsapp, newCustomerNumber } from "../support/whatsapp";
import { screenshotsOnly, shoot } from "./camera";

test.beforeEach(screenshotsOnly);
test.use({ launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] } });

test("WhatsApp chat: the pinned reply box, the emoji picker and a recording", async ({
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
  const customer = newCustomerNumber();
  const texts = [
    "Hello, we are planning a trip to Kerala in December.",
    "There will be six of us, two of them children.",
    "We would like a houseboat night and a day in Munnar.",
    "Can you share a plan and the price?",
    "Also, is airport pickup included?",
    "We land in Kochi on the 20th at 9 am.",
    "Is it safe to travel with a toddler there?",
    "What about vegetarian food on the houseboat?",
    "Please send the itinerary as a PDF if you can.",
    "Thank you, waiting for your reply.",
  ];
  await deliverWhatsapp(
    texts.map((text) => customerMessage({ to: business, customerNumber: customer, name: "Anil Kapoor", text })),
  );
  await expect(async () => {
    await owner.goto("/inbox");
    await owner
      .getByRole("link", { name: /Anil Kapoor/ })
      .first()
      .click({ timeout: 4_000 });
    await expect(owner.getByRole("list", { name: "Messages" }).getByText(texts.at(-1) ?? "")).toBeVisible({
      timeout: 6_000,
    });
  }).toPass({ timeout: 150_000 });
  await shoot(owner, "whatsapp-chat-pinned");
  const wide = (owner.viewportSize()?.width ?? 0) >= 768;
  if (wide) {
    await owner.getByRole("button", { name: "Add an emoji" }).click();
    await expect(owner.getByRole("grid").first()).toBeVisible({ timeout: 30_000 });
    await shoot(owner, "whatsapp-emoji-picker");
    await owner.keyboard.press("Escape");
  }
  await owner.getByRole("button", { name: "Record a voice note" }).click();
  await expect(owner.getByRole("timer", { name: "Recording" })).toBeVisible();
  await owner.waitForTimeout(3_200);
  await shoot(owner, "whatsapp-recording");
  await owner.close();
});
