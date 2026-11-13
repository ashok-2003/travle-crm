// A past customer's new lead, opened by the team's "Start a new lead" and by the lite turn: both take the chat's lock
// first, so the two never both open one.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openLeadForChat } from "../../../src/ai/lite/open-lead.js";
import { lockChat, startLeadFromConversation } from "../../../src/inbox/index.js";
import type { Entitlements } from "../../../src/subscriptions/index.js";
import { memberOf } from "../../imports/support/test-imports.js";
import { createTestInbox, testNow, type TestInbox } from "../../inbox/support.js";
import { liteAgency } from "./support/lite-agency.js";
import type { Agency } from "./support/turn-script.js";

const allowed: Entitlements = {
  status: "active",
  access: "full",
  planName: "Test",
  modules: new Set(["crm", "inbox", "ai"]),
  limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1e9 },
  trialEndsOn: null,
  paidThrough: null,
  nextChangeOn: null,
};

describe("a past customer's new lead", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  /** A chat whose person has only closed leads, as the button and the AI find it. */
  async function pastCustomer(): Promise<Agency> {
    const on = await liteAgency(test);
    await on.inOrg((tx) => tx.lead.updateMany({ where: { personId: on.chat.personId ?? "" }, data: { stage: "won" } }));
    return on;
  }
  const staffStarts = (on: Agency) =>
    on.inOrg((tx) =>
      startLeadFromConversation(
        tx,
        memberOf(on.organizationId, "org-owner"),
        on.chat.id,
        { ownerUserId: on.owner.userId, workers: new Set([on.owner.userId]) },
        testNow,
      ),
    );
  const openLeads = (on: Agency) =>
    on.inOrg((tx) => tx.lead.count({ where: { personId: on.chat.personId ?? "", stage: { notIn: ["won", "lost"] } } }));

  it("the team's button waits for the chat's lock, as the AI's opening takes it", async () => {
    const on = await pastCustomer();
    let released = false;
    let locked: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (locked = resolve));
    const holder = on.inOrg(async (tx) => {
      await lockChat(tx, on.chat.id);
      locked();
      await new Promise((resolve) => setTimeout(resolve, 300));
      released = true;
    });
    await held;
    await staffStarts(on);
    expect(released).toBe(true);
    await holder;
  });

  it("the button and the AI together leave one open lead", async () => {
    const on = await pastCustomer();
    const chat = { id: on.chat.id, personId: on.chat.personId, phoneE164: on.chat.phoneE164 };
    const deps = {
      db: test.db,
      identity: on.identity,
      subscriptions: { entitlementsOf: () => Promise.resolve(allowed) },
    };
    const [staff, ai] = await Promise.allSettled([
      staffStarts(on),
      openLeadForChat(deps, on.organizationId, chat, testNow),
    ]);
    expect(await openLeads(on)).toBe(1);
    // Whichever came second found the lead open: the AI takes it as opened, the button says one is open already.
    expect(ai).toMatchObject({ status: "fulfilled", value: "opened" });
    if (staff.status === "rejected") expect(staff.reason).toMatchObject({ reason: "OPEN_LEAD_EXISTS" });
  });
});
