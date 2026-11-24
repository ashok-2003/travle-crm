// A chat's row says when the AI handed it to a person and nobody has answered since (inbox revamp spec, item 10).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listConversations } from "../../src/inbox/index.js";
import { freshPhone } from "../crm/support/records.js";
import { memberOf } from "../imports/support/test-imports.js";
import { aConnectedAgency, createTestInbox, testNow, type TestInbox } from "./support.js";

describe("the list's handed-over flag", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  it("is true while a handed-over chat waits, false once the team has replied or when the AI never had it", async () => {
    const connection = await aConnectedAgency(test);
    const ids = await test.db.forOrg(connection.organizationId, async (tx) => {
      const chat = async (needsReply: boolean, handedOff: boolean | null) => {
        const made = await tx.whatsappConversation.create({
          data: { connectionId: connection.connectionId, phoneE164: freshPhone(), needsReply, lastMessageAt: testNow },
        });
        if (handedOff !== null) {
          await tx.aiChat.create({
            data: {
              conversationId: made.id,
              ...(handedOff && { handedOffAt: testNow, handoffReason: "Wants a call" }),
            },
          });
        }
        return made.id;
      };
      return {
        waiting: await chat(true, true),
        answered: await chat(false, true),
        none: await chat(true, null),
        kept: await chat(true, false),
      };
    });
    const admin = memberOf(connection.organizationId, "org-admin", { userId: randomUUID() });
    const page = await test.db.forOrg(connection.organizationId, (tx) =>
      listConversations(tx, admin, { filter: "all", limit: 20 }, testNow),
    );
    const flag = (id: string) => page.items.find((item) => item.id === id)?.handedOver;
    expect([flag(ids.waiting), flag(ids.answered), flag(ids.none), flag(ids.kept)]).toEqual([
      true,
      false,
      false,
      false,
    ]);
  });
});
