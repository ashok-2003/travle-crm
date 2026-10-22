// A flood is told once an hour: however many refusals, one notice for the Owner in each UTC hour.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { publicActor } from "../../src/kernel/index.js";
import { noteFlood } from "../../src/website-forms/index.js";
import { anAgency, anOpenForm, createTestForms, testNow, type TestForms } from "./support.js";

describe("noteFlood", () => {
  let test: TestForms;
  beforeAll(async () => {
    test = await createTestForms();
  });
  afterAll(() => test.close());

  it("one notice per hour however many refusals", async () => {
    const organizationId = await anAgency(test);
    const { form } = await anOpenForm(test, organizationId);
    const ownerUserId = randomUUID();
    const note = (at: Date) =>
      test.db.forOrg(organizationId, (tx) =>
        noteFlood(tx, publicActor(organizationId), { formId: form.id, ownerUserId, now: at }),
      );
    const notices = () =>
      test.db.forOrg(organizationId, (tx) => tx.notification.findMany({ where: { kind: "form.busy" } }));
    for (let refusal = 0; refusal < 5; refusal += 1) await note(new Date(testNow.getTime() + refusal * 60_000));
    expect(await notices()).toHaveLength(1);
    await note(new Date(testNow.getTime() + 3_600_000));
    expect(await notices()).toHaveLength(2);
    expect((await notices())[0]).toMatchObject({
      recipientUserId: ownerUserId,
      link: "/settings/lead-sources/website-form",
    });
  });
});
