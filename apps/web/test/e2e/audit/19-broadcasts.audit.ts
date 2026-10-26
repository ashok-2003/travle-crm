// The visual audit's broadcasts (PR 11, part 2): the empty list, a new broadcast and its preview (who is left out and why),
// a broadcast sent with its chats, one that paused itself, and the list with both.
import { expect, signInToConsole, test } from "../support/console";
import { signInByEmail } from "../support/fixtures";
import { connectNumber, inAgency, newCustomerNumber } from "../support/whatsapp";
import { screenshotsOnly, shoot } from "./camera";

test.beforeEach(screenshotsOnly);
test.use({ actionTimeout: 30_000 });

test("Broadcasts: the list, a new broadcast with its preview, a broadcast's page, and a paused one", async ({
  page,
  browser,
  superAdmin,
  agency,
}) => {
  test.setTimeout(600_000);
  await signInToConsole(page, superAdmin);
  await connectNumber(page, agency.organizationId);
  const names = ["Meera Iyer", "Karan Shah", "Anita Desai", "Dev Patel", "Isha Rao"];
  await inAgency(agency.organizationId, async (tx) => {
    const connection = await tx.whatsappConnection.findFirstOrThrow({ where: { status: { not: "disconnected" } } });
    await tx.whatsappTemplate.create({
      data: {
        connectionId: connection.id,
        name: "goa_offer",
        language: "en",
        category: "marketing",
        body: "Hi {{1}}, our Goa packages are on offer.",
        status: "approved",
      },
    });
    const tag = await tx.inboxTag.create({ data: { name: "Goa interested" } });
    for (const [index, name] of names.entries()) {
      const digits = newCustomerNumber();
      const person = await tx.person.create({ data: { name, phoneE164: `+${digits}` } });
      // The first three agreed, the fourth asked to stop, the fifth was never asked.
      if (index < 4) {
        await tx.personConsent.create({
          data: {
            personId: person.id,
            purpose: "whatsapp",
            action: index === 3 ? "withdrawn" : "granted",
            wording: "Agreed",
            wordingVersion: 1,
            source: "staff",
            recordedAt: new Date(),
          },
        });
      }
      const chat = await tx.whatsappConversation.create({
        data: { connectionId: connection.id, phoneE164: `+${digits}`, personId: person.id },
      });
      await tx.conversationTag.create({ data: { conversationId: chat.id, tagId: tag.id } });
    }
  });
  const owner = await browser.newPage();
  await signInByEmail(owner, agency.owner);
  await owner.goto("/inbox/broadcasts");
  await expect(owner.getByText(/No broadcast yet/)).toBeVisible();
  await shoot(owner, "broadcasts-empty");

  await owner.getByRole("button", { name: "New broadcast" }).click();
  const dialog = owner.getByRole("dialog", { name: "New broadcast" });
  await dialog.getByRole("combobox", { name: "Template" }).click();
  await owner.getByRole("option", { name: "goa_offer" }).click();
  await dialog.getByLabel("Blank 1").fill("there");
  await dialog.getByRole("button", { name: "Goa interested" }).click();
  await shoot(owner, "broadcast-new");
  await dialog.getByRole("button", { name: "Check who it reaches" }).click();
  await expect(dialog.getByText("It reaches 3 chats.")).toBeVisible();
  await shoot(owner, "broadcast-preview");
  await dialog.getByRole("button", { name: "Send to 3 chats" }).click();
  await expect(owner.getByRole("heading", { level: 1, name: "goa_offer" })).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await owner.reload();
    await expect(owner.getByText("Done", { exact: true })).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 120_000 });
  await shoot(owner, "broadcast-page");

  // A second broadcast that paused itself because WhatsApp refused ten of the ten it had sent (the rule: at least a fifth of at
  // least ten): their messages failed, so the page counts them under Not delivered, and two chats still wait.
  const pausedId = await inAgency(agency.organizationId, async (tx) => {
    const template = await tx.whatsappTemplate.findFirstOrThrow();
    const tag = await tx.inboxTag.findFirstOrThrow();
    const connection = await tx.whatsappConnection.findFirstOrThrow({ where: { status: { not: "disconnected" } } });
    const waiting = await tx.whatsappConversation.findMany({ take: 2 });
    const broadcast = await tx.whatsappBroadcast.create({
      data: {
        requestId: crypto.randomUUID(),
        templateId: template.id,
        params: ["there"],
        status: "paused",
        pausedReason: "failure_rate",
        pausedAt: new Date(),
        createdBy: (await tx.whatsappBroadcast.findFirstOrThrow()).createdBy,
      },
    });
    await tx.whatsappBroadcastTag.create({ data: { broadcastId: broadcast.id, tagId: tag.id } });
    for (let index = 0; index < 10; index += 1) {
      const digits = newCustomerNumber();
      const chat = await tx.whatsappConversation.create({
        data: { connectionId: connection.id, phoneE164: `+${digits}`, profileName: `Traveller ${String(index + 1)}` },
      });
      const message = await tx.whatsappMessage.create({
        data: {
          conversationId: chat.id,
          direction: "out",
          origin: "staff_crm",
          kind: "template",
          templateId: template.id,
          body: "Hi there, our Goa packages are on offer.",
          status: "failed",
          failureCode: "other",
          broadcastId: broadcast.id,
          occurredAt: new Date(),
        },
      });
      await tx.whatsappBroadcastRecipient.create({
        data: { broadcastId: broadcast.id, conversationId: chat.id, state: "sent", messageId: message.id },
      });
    }
    await tx.whatsappBroadcastRecipient.createMany({
      data: waiting.map((chat) => ({ broadcastId: broadcast.id, conversationId: chat.id })),
    });
    return broadcast.id;
  });
  await owner.goto(`/inbox/broadcasts/${pausedId}`);
  await expect(owner.getByText(/paused itself/)).toBeVisible();
  await shoot(owner, "broadcast-paused");
  await owner.goto("/inbox/broadcasts");
  await expect(owner.getByRole("link", { name: /goa_offer/ }).first()).toBeVisible();
  await shoot(owner, "broadcasts-list");
  await owner.close();
});
