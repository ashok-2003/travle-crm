// Suggest reply (ADR 0029; the owner's decisions of 2026-10-28): off until the agency turns it on in Settings, AI; then a
// button in the chat puts the AI's draft in the reply box, marked as the AI's until the person changes it; it sends nothing
// by itself, and the reply the person sends is audited as drafted by AI, sent by them. OpenRouter is the fake of
// support/fake-openrouter.ts: nothing here reaches OpenRouter.
import { expect, signInToConsole, test } from "./support/console";
import { signInByEmail } from "./support/fixtures";
import { connectNumber, inAgency, newCustomerNumber, openNewChat, sentTo } from "./support/whatsapp";

const fakeOpenRouter = () => process.env.E2E_AI_URL ?? "";

test("an Owner turns Suggest reply on, a draft lands in the box, they change it and send it", async ({
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
  const chat = await openNewChat(owner, business, customer, "Rahul Mehta", "Hi, do you have a Kerala package for 4?");

  // Off by default: no button in the chat.
  await expect(chat.getByRole("combobox", { name: "Message" })).toBeVisible();
  await expect(chat.getByRole("button", { name: "Suggest reply" })).toHaveCount(0);

  // The Owner turns it on in Settings, AI, with an instruction.
  await owner.goto("/settings/ai");
  await expect(owner.getByRole("heading", { level: 1, name: "AI" })).toBeVisible();
  await owner.getByLabel("Let my staff ask the AI for a suggested reply").click();
  await owner.getByLabel("Instructions for the AI").fill("Reply warm and short. Never offer a discount.");
  await owner.getByRole("button", { name: "Save" }).click();
  await expect(owner.getByText("AI settings saved")).toBeVisible();

  // The draft lands in the box, marked as the AI's, and nothing has been sent.
  await owner.goto("/inbox");
  await owner
    .getByRole("link", { name: /Rahul Mehta/ })
    .first()
    .click();
  const panel = owner.getByRole("region", { name: "Chat with Rahul Mehta" });
  const box = panel.getByRole("combobox", { name: "Message" });
  await panel.getByRole("button", { name: "Suggest reply" }).click();
  await expect(box).toHaveValue(/Which dates are you planning to travel/);
  await expect(panel.getByText("Drafted by AI")).toBeVisible();
  expect(await sentTo(customer)).toHaveLength(0);

  // What the AI was asked: zero data retention, the agency's instructions, the customer's words, and no phone number.
  const [request] = (await (await fetch(`${fakeOpenRouter()}/_requests`)).json()) as {
    authorization: string;
    body: { provider: { zdr: boolean }; messages: { content: string }[] };
  }[];
  expect(request?.body.provider.zdr).toBe(true);
  const prompt = request?.body.messages.map((message) => message.content).join("\n") ?? "";
  expect(prompt).toContain("Never offer a discount.");
  expect(prompt).toContain("Kerala package for 4");
  expect(prompt).not.toContain(customer);

  // The person changes it: it is no longer marked, and what they send is what they wrote.
  await box.fill("Namaste Rahul! Which dates are you planning, and from which city?");
  await expect(panel.getByText("Drafted by AI")).toHaveCount(0);
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  await expect(box).toHaveValue("");
  await expect(async () => {
    const sent = await sentTo(customer);
    expect(sent.map((message) => message.text)).toEqual([
      "Namaste Rahul! Which dates are you planning, and from which city?",
    ]);
  }).toPass({ timeout: 60_000 });

  // Audited as drafted by AI, sent by the Owner, and that they changed it.
  const entries = await inAgency(agency.organizationId, (tx) =>
    tx.auditEntry.findMany({ where: { action: "ai.draft-sent" } }),
  );
  expect(entries).toHaveLength(1);
  expect(entries[0]?.after).toMatchObject({ changedByMember: true });
});
