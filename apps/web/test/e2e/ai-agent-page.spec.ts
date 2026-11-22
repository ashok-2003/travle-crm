// The AI agent page (web revamp, 2026-11-22), on a phone and a desktop, against the real api: a chat the AI answered and
// handed over, as the agent leaves them. The owner sees the state beside the title, Setup with how far it has come, the
// last 24 hours and Needs you · 1; Chats answered opens the Inbox on exactly the chats the AI answered, as a chip that
// goes when pressed; Setup is a page of its own with a way back.
import { randomUUID } from "node:crypto";
import { expectAccessible } from "./support/accessibility";
import { expect, signInToConsole, test } from "./support/console";
import { signInByEmail } from "./support/fixtures";
import { connectNumber, inAgency, newCustomerNumber, openNewChat } from "./support/whatsapp";

test.use({ actionTimeout: 15_000 });

test("the owner reads the AI's day and what needs them, opens the chats it answered, and finds Setup on its own page", async ({
  page,
  browser,
  superAdmin,
  agency,
}) => {
  test.setTimeout(300_000);
  const consolePage = await browser.newPage();
  await signInToConsole(consolePage, superAdmin);
  const business = await connectNumber(consolePage, agency.organizationId);
  await consolePage.close();
  const owner = page;
  await signInByEmail(owner, agency.owner);
  await openNewChat(owner, business, newCustomerNumber(), "Meera Rao", "Hi, do you have a Kerala package for 4?");
  // What the agent leaves when it answers and then hands the chat over.
  await inAgency(agency.organizationId, async (tx) => {
    const chat = await tx.whatsappConversation.findFirstOrThrow({ where: { profileName: "Meera Rao" } });
    await tx.whatsappMessage.create({
      data: {
        conversationId: chat.id,
        direction: "out",
        origin: "staff_crm",
        kind: "text",
        body: "Happy to help! Here are our Kerala trips.",
        clientToken: `ai:${randomUUID()}`,
        status: "sent",
        occurredAt: new Date(),
      },
    });
    await tx.aiChat.create({
      data: { conversationId: chat.id, handedOffAt: new Date(), handoffReason: "Asked for a discount" },
    });
  });

  await owner.goto("/ai-agent");
  await expect(owner.getByRole("heading", { level: 1, name: "AI agent" })).toBeVisible();
  await expect(owner.getByText("Not set up yet")).toBeVisible();
  await expect(owner.getByRole("link", { name: /^Setup · \d of 7$/ })).toBeVisible();
  await expect(owner.getByRole("tab")).toHaveText(["Overview", "Try it"]);
  await expect(owner.getByRole("heading", { name: "Needs you · 1" })).toBeVisible();
  await expect(owner.getByRole("link", { name: "Meera Rao" })).toBeVisible();
  await expectAccessible(owner);

  // Chats answered opens its list: the Inbox, on the chats the AI answered.
  await owner.getByRole("link", { name: "Chats answered" }).click();
  await expect(owner).toHaveURL(/\/inbox\?show=ai-answered$/);
  const chip = owner.getByRole("button", { name: "Filter: Answered by the AI" });
  await expect(chip).toBeVisible();
  await expect(owner.getByRole("link", { name: /Meera Rao/ }).first()).toBeVisible();
  await expectAccessible(owner);
  await chip.click();
  await expect(owner).toHaveURL(/\/inbox$/);
  await expect(chip).toBeHidden();

  // Setup is a page of its own, with a way back.
  await owner.goto("/ai-agent?tab=setup");
  await expect(owner).toHaveURL(/\/ai-agent\/setup$/);
  await expect(owner.getByRole("heading", { level: 1, name: "AI agent setup" })).toBeVisible();
  await expect(owner.getByRole("progressbar", { name: /^\d of 7 done$/ })).toBeVisible();
  await expect(owner.getByRole("link", { name: "Manage WhatsApp number" })).toBeVisible();
  await expectAccessible(owner);
  await owner.getByRole("main").getByRole("link", { name: "AI agent", exact: true }).click();
  await expect(owner.getByRole("heading", { level: 1, name: "AI agent" })).toBeVisible();
});
