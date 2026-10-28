// The autopilot (AI step 2; the owner's decisions of 2026-10-28): off until an Owner turns it on in Settings, AI; then, when a
// customer writes, the AI answers inside the window, the message is marked "Sent by the AI" in the chat and audited, and the
// customer receives it. STOP is obeyed. OpenRouter is the fake of support/fake-openrouter.ts: nothing here reaches it.
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

test("an Owner turns the autopilot on, the AI answers a customer by itself, marked as the AI's and audited", async ({
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
  await openNewChat(owner, business, customer, "Rahul Mehta", "Hi, do you have a Kerala package for 4?");

  // Off by default: the customer's message got no answer from the AI.
  await owner.waitForTimeout(8_000);
  expect((await sentTo(customer)).filter((message) => (message.text ?? "").includes('Kerala 5 nights'))).toHaveLength(0);

  // The Owner turns the AI on, then the autopilot, in Settings, AI.
  await owner.goto("/settings/ai");
  await expect(owner.getByRole("heading", { level: 1, name: "AI" })).toBeVisible();
  await owner.getByLabel("Let the AI draft replies and guess how leads will go").click();
  await owner.getByRole("button", { name: "Save", exact: true }).click();
  await expect(owner.getByText("AI settings saved")).toBeVisible();
  const autopilot = owner.getByRole("switch", { name: "Let the AI answer WhatsApp chats by itself" });
  await expect(autopilot).toBeEnabled();
  await expect(autopilot).not.toBeChecked();
  await autopilot.click();
  await owner.getByRole("button", { name: "Save the autopilot" }).click();
  await expect(owner.getByText("Autopilot settings saved")).toBeVisible();

  // The customer writes again: the AI answers, and the customer receives it.
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
    const sent = await sentTo(customer);
    expect(sent.some((message) => (message.text ?? "").includes('Kerala 5 nights is Rs 18,500'))).toBe(true);
  }).toPass({ timeout: 90_000 });

  // In the chat the message is marked as the AI's, and the audit log has it.
  await owner.goto("/inbox");
  await owner
    .getByRole("link", { name: /Rahul Mehta/ })
    .first()
    .click();
  const panel = owner.getByRole("region", { name: "Chat with Rahul Mehta" });
  await expect(panel.getByText("Kerala 5 nights is Rs 18,500")).toBeVisible();
  await expect(panel.getByText(/Sent by the AI/)).toBeVisible();
  const audited = await inAgency(agency.organizationId, (tx) =>
    tx.auditEntry.count({ where: { action: "ai.message-sent" } }),
  );
  expect(audited).toBe(1);

  // STOP is obeyed: after it the AI writes nothing more.
  expect(
    await deliverWhatsapp([
      customerMessage({ to: business, customerNumber: customer, name: "Rahul Mehta", text: "STOP" }),
    ]),
  ).toBe(200);
  expect(
    await deliverWhatsapp([
      customerMessage({ to: business, customerNumber: customer, name: "Rahul Mehta", text: "Okay, dates are 12 Dec" }),
    ]),
  ).toBe(200);
  await owner.waitForTimeout(10_000);
  expect(
    (await sentTo(customer)).filter((message) => (message.text ?? "").includes('Kerala 5 nights is Rs 18,500')),
  ).toHaveLength(1);
  await owner.close();
});
