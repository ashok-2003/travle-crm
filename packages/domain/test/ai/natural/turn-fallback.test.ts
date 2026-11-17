// The natural agent's last try names a payment photo in the team's task, as the one agent's turns do.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PAYMENT_PHOTO_TASK } from "../../../src/ai/one/before-the-model.js";
import { runNaturalFallback } from "../../../src/ai/natural/turn-fallback.js";
import { createTestInbox, type TestInbox } from "../../inbox/support.js";
import { liveAgency, liveAt, liveNow } from "./support/live-agency.js";

describe("the natural agent's last try", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  it("adds the payment photo's task words to the team's task", async () => {
    const on = await liveAgency(test);
    await on.write({ direction: "out", at: liveAt(-100), body: "UPI: casetrips@okbank", clientToken: "ai:turn-1:pay" });
    const photo = await on.write({ direction: "in", at: liveAt(-60), kind: "image" });
    await runNaturalFallback(on.dependencies(), on.turnInput(photo), liveNow);
    const notes = await on.inOrg((tx) => tx.leadNote.findMany({ where: { leadId: on.leadId, byAi: true } }));
    const tasks = await on.inOrg((tx) => tx.task.findMany({ where: { recordType: "lead", recordId: on.leadId } }));
    const text = [...notes.map((note) => note.body), ...tasks.map((task) => task.title)].join("\n");
    expect(text).toContain(PAYMENT_PHOTO_TASK);
  });
});
