// The one agent's step before the model: a likely payment photo is the team's task, a voice note asks nothing.
import { describe, expect, it } from "vitest";
import { oneBeforeTheModel, PAYMENT_PHOTO_NOTICE, PAYMENT_PHOTO_TASK } from "../../../src/ai/one/before-the-model.js";
import type { NaturalChatLine } from "../../../src/ai/natural/types.js";

const line = (extra: Partial<NaturalChatLine>): NaturalChatLine => ({
  id: "line-1",
  from: "customer",
  at: new Date("2026-11-17T10:00:00Z"),
  kind: "image",
  text: "",
  ...extra,
});

describe("the one agent before the model", () => {
  it("adds the payment task and notice for a likely payment, and nothing forced", () => {
    expect(oneBeforeTheModel([line({ mayBePayment: true })])).toEqual({
      notice: PAYMENT_PHOTO_NOTICE,
      tools: "all",
      forced: [],
      task: { kind: "question", text: PAYMENT_PHOTO_TASK },
    });
  });

  it("asks nothing of a voice note before the model", () => {
    expect(oneBeforeTheModel([line({ untranscribed: true })])).toEqual({
      notice: null,
      tools: "all",
      forced: [],
      task: null,
    });
  });
});
