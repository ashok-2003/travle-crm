// Two WhatsApp numbers for one agency (spec 2026-11-22, Review Focus 1, through the real api and worker): a super admin
// records and connects two numbers on a two-number plan, after which the console offers no third; a customer writes to
// both; staff reply in the second number's chat, and the fake MSG91 is asked to send that reply from the second number;
// the chat's header links the customer's chat on the first. MSG91 is the fake of support/fake-msg91.ts.
import { planModules } from "@travel-crm/contracts/subscriptions";
import { expect, signInToConsole, test } from "./support/console";
import { signInByEmail } from "./support/fixtures";
import {
  connectNumber,
  customerMessage,
  deliverWhatsapp,
  inAgency,
  newCustomerNumber,
  sentTo,
} from "./support/whatsapp";

const CUSTOMER = "Two Numbers Customer";

test("a reply in the second number's chat goes from the second number, and the chat links the first", async ({
  page,
  browser,
  superAdmin,
  agency,
  database,
}) => {
  test.setTimeout(480_000);
  // The agency on a plan of two numbers, as Growth sells. Archived, so no other journey's console offers it.
  const suffix = crypto.randomUUID().slice(0, 8);
  const plan = await database.platform.plan.create({
    data: {
      key: `two-numbers-${suffix}`,
      name: `Two numbers ${suffix}`,
      monthlyPricePaise: 0,
      seatLimit: 10,
      whatsappNumberLimit: 2,
      storageLimitBytes: 1_000_000_000n,
      modules: [...planModules],
      archivedAt: new Date(),
    },
    select: { id: true },
  });
  await database.platform.subscription.update({
    where: { organizationId: agency.organizationId },
    data: { planId: plan.id },
  });

  // The super admin records and connects both; the plan then has no room for a third.
  await signInToConsole(page, superAdmin);
  const first = await connectNumber(page, agency.organizationId, "Sales 1");
  const second = await connectNumber(page, agency.organizationId, "Sales 2");
  const group = page.getByRole("region", { name: "WhatsApp" });
  await expect(group.getByText("2 of 2 numbers", { exact: false })).toBeVisible();
  await expect(group.getByRole("button", { name: "Connect a number" })).toHaveCount(0);

  // A customer writes to the first number, then to the second: two chats, one person.
  const customer = newCustomerNumber();
  for (const [to, text] of [
    [first, "Hello, is the Kedarnath trip on?"],
    [second, "Writing here too about Kedarnath."],
  ] as const) {
    expect(await deliverWhatsapp([customerMessage({ to, customerNumber: customer, name: CUSTOMER, text })])).toBe(200);
  }
  const chatOn = (business: string) =>
    inAgency(agency.organizationId, async (tx) => {
      const chat = await tx.whatsappConversation.findFirst({
        where: { phoneE164: `+${customer}`, connection: { integratedNumber: business } },
        select: { id: true },
      });
      return chat?.id ?? null;
    });
  // The worker stores each message a moment after the webhook answered.
  await expect.poll(() => chatOn(first), { timeout: 60_000 }).not.toBeNull();
  await expect.poll(() => chatOn(second), { timeout: 60_000 }).not.toBeNull();
  const firstChat = (await chatOn(first)) ?? "";

  // Staff open the second number's chat: its row is labelled Sales 2.
  const owner = await browser.newPage();
  await signInByEmail(owner, agency.owner);
  const panel = owner.getByRole("region", { name: `Chat with ${CUSTOMER}` });
  await expect(async () => {
    await owner.goto("/inbox");
    await owner.getByRole("radio", { name: "All" }).click({ timeout: 4_000 });
    await owner
      .getByRole("link", { name: new RegExp(CUSTOMER) })
      .filter({ hasText: "Sales 2" })
      .click({ timeout: 4_000 });
    await expect(panel.getByText("Writing here too about Kedarnath.")).toBeVisible({ timeout: 6_000 });
  }).toPass({ timeout: 150_000 });

  // The header links the customer's chat on the first number.
  await expect(panel.getByRole("link", { name: "Also on Sales 1" })).toHaveAttribute("href", `/inbox/${firstChat}`);

  // The reply goes from the second number.
  await panel.getByRole("combobox", { name: "Message" }).fill("Yes, it runs every Saturday.");
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  await expect
    .poll(async () => (await sentTo(customer)).map(({ text, from }) => ({ text, from })), { timeout: 60_000 })
    .toEqual([{ text: "Yes, it runs every Saturday.", from: second }]);
});
