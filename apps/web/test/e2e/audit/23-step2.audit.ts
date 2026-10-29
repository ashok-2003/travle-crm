// The visual audit of the automatic WhatsApps and the autopilot (2026-10-29): Settings, Sales automation; Settings, AI with the
// autopilot on; and a chat with a message the AI sent by itself, marked as the AI's.
import { expect, signInToConsole, test } from "../support/console";
import { signInByEmail } from "../support/fixtures";
import {
  connectNumber,
  customerMessage,
  deliverWhatsapp,
  newCustomerNumber,
  openNewChat,
  sentTo,
} from "../support/whatsapp";
import { screenshotsOnly, shoot } from "./camera";

test.beforeEach(screenshotsOnly);
test.use({ actionTimeout: 30_000 });

test("Sales automation, the autopilot and a chat with an AI message", async ({ page, browser, superAdmin, agency }) => {
  test.setTimeout(360_000);
  await signInToConsole(page, superAdmin);
  const business = await connectNumber(page, agency.organizationId);
  const owner = await browser.newPage();
  await owner.setViewportSize(page.viewportSize() ?? { width: 390, height: 844 });
  await signInByEmail(owner, agency.owner);
  const customer = newCustomerNumber();
  await openNewChat(owner, business, customer, "Rahul Mehta", "Hi, do you have a Kerala package for 4?");

  await owner.goto("/settings/sales-automation");
  await expect(owner.getByRole("heading", { level: 1, name: "Sales automation" })).toBeVisible();
  await shoot(owner, "step2-sales-automation");

  await owner.goto("/settings/ai");
  await expect(owner.getByRole("heading", { level: 1, name: "AI sales agent" })).toBeVisible();
  await owner.getByLabel("Let the AI draft replies and guess how leads will go").click();
  await owner.getByRole("button", { name: "Save", exact: true }).click();
  await expect(owner.getByText("AI settings saved")).toBeVisible();
  const autopilot = owner.getByRole("switch", { name: "Let the AI answer WhatsApp chats by itself" });
  await autopilot.click();
  await owner.getByRole("button", { name: "Save the autopilot" }).click();
  await expect(owner.getByText("Autopilot settings saved")).toBeVisible();
  await autopilot.scrollIntoViewIfNeeded();
  await shoot(owner, "step2-ai-autopilot");

  expect(
    await deliverWhatsapp([
      customerMessage({
        to: business,
        customerNumber: customer,
        name: "Rahul Mehta",
        text: "What is the price for four?",
      }),
    ]),
  ).toBe(200);
  await expect(async () => {
    expect(
      (await sentTo(customer)).some((message) => (message.text ?? "").includes("Kerala 5 nights is Rs 18,500")),
    ).toBe(true);
  }).toPass({ timeout: 90_000 });
  await owner.goto("/inbox");
  await owner
    .getByRole("link", { name: /Rahul Mehta/ })
    .first()
    .click();
  const panel = owner.getByRole("region", { name: "Chat with Rahul Mehta" });
  await expect(panel.getByText(/Sent by the AI/)).toBeVisible();
  await shoot(owner, "step2-chat-ai-message");
});
