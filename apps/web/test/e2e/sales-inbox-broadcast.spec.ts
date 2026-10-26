// A broadcast from preview to sent (sales inbox spec 6, rebuilt 2026-10-26), on a phone and a desktop: the Owner picks an
// approved template and a tag, the preview says two chats get it and leaves out the one who asked to stop and the one with no
// consent recorded, the confirm sends to the two, and the broadcast's page shows them sent. MSG91 is the fake of fake-msg91.ts.
import { expect, signInToConsole, test } from "./support/console";
import { signInByEmail } from "./support/fixtures";
import { connectNumber, inAgency, newCustomerNumber, sentTo } from "./support/whatsapp";

// A step that finds nothing fails in seconds, not at the end of the test's time.
test.use({ actionTimeout: 20_000 });

test("a broadcast from preview to sent leaves out who asked to stop and who never agreed", async ({
  page,
  browser,
  superAdmin,
  agency,
}) => {
  test.setTimeout(420_000);
  await signInToConsole(page, superAdmin);
  const business = await connectNumber(page, agency.organizationId);
  const numbers = {
    first: newCustomerNumber(),
    second: newCustomerNumber(),
    stopped: newCustomerNumber(),
    unasked: newCustomerNumber(),
  };
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
    const chat = async (digits: string, name: string, consent: "granted" | "withdrawn" | null) => {
      const person = await tx.person.create({ data: { name, phoneE164: `+${digits}` } });
      if (consent !== null) {
        await tx.personConsent.create({
          data: {
            personId: person.id,
            purpose: "whatsapp",
            action: consent,
            wording: "Agreed",
            wordingVersion: 1,
            source: "staff",
            recordedAt: new Date(),
          },
        });
      }
      const row = await tx.whatsappConversation.create({
        data: { connectionId: connection.id, phoneE164: `+${digits}`, personId: person.id },
      });
      await tx.conversationTag.create({ data: { conversationId: row.id, tagId: tag.id } });
    };
    await chat(numbers.first, "Meera Iyer", "granted");
    await chat(numbers.second, "Karan Shah", "granted");
    await chat(numbers.stopped, "Dev Patel", "withdrawn");
    await chat(numbers.unasked, "Isha Rao", null);
  });
  expect(business).toBeTruthy();

  const owner = await browser.newPage();
  await signInByEmail(owner, agency.owner);
  await owner.goto("/inbox/broadcasts");
  await expect(owner.getByText(/No broadcast yet/)).toBeVisible();
  await owner.getByRole("button", { name: "New broadcast" }).click();
  const dialog = owner.getByRole("dialog", { name: "New broadcast" });
  await dialog.getByRole("combobox", { name: "Template" }).click();
  await owner.getByRole("option", { name: "goa_offer" }).click();
  await dialog.getByLabel("Blank 1").fill("there");
  await dialog.getByRole("button", { name: "Goa interested" }).click();
  await dialog.getByRole("button", { name: "Check who it reaches" }).click();
  await expect(dialog.getByText("It reaches 2 chats.")).toBeVisible();
  await expect(dialog.getByText("Left out: 1 asked to stop · 1 has no WhatsApp consent recorded.")).toBeVisible();
  await expect(dialog.getByText(/This month's allowance: 0 of 300 used, 300 left/)).toBeVisible();
  await dialog.getByRole("button", { name: "Send to 2 chats" }).click();

  // Its own page: the two went, and the fake MSG91 was asked to send each of them the template.
  await expect(owner.getByRole("heading", { level: 1, name: "goa_offer" })).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await owner.reload();
    await expect(owner.getByRole("row", { name: /Meera Iyer.*Sent/ })).toBeVisible({ timeout: 4_000 });
    await expect(owner.getByRole("row", { name: /Karan Shah.*Sent/ })).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 120_000 });
  // The worker's sender takes them one at a time, a moment after they were queued.
  await expect.poll(async () => (await sentTo(numbers.first)).length, { timeout: 60_000 }).toBe(1);
  await expect.poll(async () => (await sentTo(numbers.second)).length, { timeout: 60_000 }).toBe(1);
  expect(await sentTo(numbers.stopped)).toHaveLength(0);
  expect(await sentTo(numbers.unasked)).toHaveLength(0);
  await expect(owner.getByText("Done", { exact: true })).toBeVisible({ timeout: 60_000 });
  // The agency sees counts, never a price.
  await expect(owner.getByText(/₹|rupee|Meta charges/i)).toHaveCount(0);
  await owner.goto("/inbox/broadcasts");
  await expect(owner.getByRole("link", { name: /goa_offer/ })).toBeVisible({ timeout: 20_000 });
  await owner.close();
});
