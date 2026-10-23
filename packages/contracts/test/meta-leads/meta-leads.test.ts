// The Meta screens' inputs refuse unknown keys, take ids only, and the webhook body reads only well-formed leadgen changes.
import { describe, expect, it } from "vitest";
import {
  leadgenChangesOf,
  MAX_META_PAGES,
  metaBringInInput,
  metaConnectedPages,
  metaConnectFinishInput,
  metaConnectPagesInput,
  metaConnectStartInput,
  metaFormInput,
  metaPageDetail,
  metaPageIdInput,
  metaProblemInput,
  metaProblemsInput,
  metaSaveQuestionsInput,
  metaQuestionFields,
} from "../../src/meta-leads/index.js";

const id = "0199e7a0-0000-7000-8000-0000000000a1";

describe("the Meta lead ads' inputs", () => {
  it("refuses unknown keys in every input", () => {
    const inputs = [
      [metaPageIdInput, { pageId: id }],
      [metaConnectStartInput, {}],
      [metaConnectFinishInput, { code: "c", state: "s" }],
      [metaConnectPagesInput, { pageIds: ["123"] }],
      [metaFormInput, { pageId: id, formId: id }],
      [
        metaBringInInput,
        { pageId: id, formId: id, questions: [{ key: "q", field: "note" }], earlierLeads: "only_new" },
      ],
      [metaSaveQuestionsInput, { pageId: id, formId: id, questions: [] }],
      [metaProblemInput, { pageId: id, leadRowId: id }],
      [metaProblemsInput, { pageId: id }],
    ] as const;
    for (const [schema, input] of inputs) {
      expect(schema.safeParse(input).success).toBe(true);
      expect(schema.safeParse({ ...input, extra: 1 }).success).toBe(false);
    }
  });

  it("limits a question's field to the lead import's fields without stage, or null", () => {
    expect(metaQuestionFields).not.toContain("stage");
    expect(metaQuestionFields).toContain("note");
    const base = { pageId: id, formId: id, earlierLeads: "last_30_days" };
    expect(metaBringInInput.safeParse({ ...base, questions: [{ key: "q", field: null }] }).success).toBe(true);
    expect(metaBringInInput.safeParse({ ...base, questions: [{ key: "q", field: "stage" }] }).success).toBe(false);
    expect(metaBringInInput.safeParse({ ...base, earlierLeads: "all", questions: [] }).success).toBe(false);
  });

  it("takes Meta's ids in a safe shape, and never a URL or a path", () => {
    expect(metaConnectPagesInput.safeParse({ pageIds: ["1234567890"] }).success).toBe(true);
    expect(metaConnectPagesInput.safeParse({ pageIds: ["../me/accounts"] }).success).toBe(false);
    expect(metaConnectPagesInput.safeParse({ pageIds: [] }).success).toBe(false);
  });

  it("caps Pages at five", () => {
    expect(MAX_META_PAGES).toBe(5);
  });
});

describe("the Meta lead ads' outputs", () => {
  it("strips anything not named, so a token could never ride along", () => {
    const parsed = metaConnectedPages.parse({ connected: [], refused: [], token: "EAAB", tokenCiphertext: "x" });
    expect(parsed).toEqual({ connected: [], refused: [] });
    const detail = metaPageDetail.parse({
      id,
      pageName: "P",
      status: "running",
      badge: "running",
      attentionSince: null,
      connectedBy: null,
      connectedAt: "2026-10-23T10:00:00.000Z",
      lastCheckedAt: null,
      tokenExpiresAt: null,
      checkRunning: false,
      late: false,
      readOnly: false,
      counts: { added: 1, mergedIntoExisting: 0, duplicates: 0, couldntBeAdded: 0 },
      token: "EAAB",
    });
    expect("token" in detail).toBe(false);
  });
});

describe("leadgenChangesOf", () => {
  const change = (value: unknown, field = "leadgen") => ({ field, value });
  const body = (changes: unknown[]) => ({ object: "page", entry: [{ id: "P1", time: 1, changes }] });

  it("reads each well-formed leadgen change in order", () => {
    const value = (n: number) => ({ leadgen_id: "L" + String(n), page_id: "P1", form_id: "F1", created_time: 100 + n });
    expect(leadgenChangesOf(body([change(value(1)), change(value(2))])).map((c) => c.leadgenId)).toEqual(["L1", "L2"]);
  });

  it("skips another field, a malformed value and a non-page object, without failing its neighbours", () => {
    const good = { leadgen_id: "L1", page_id: "P1", form_id: "F1" };
    expect(
      leadgenChangesOf(body([change(good, "feed"), change({ leadgen_id: 5 }), change(null), change(good)])),
    ).toEqual([{ leadgenId: "L1", pageId: "P1", formId: "F1", createdTime: null }]);
    expect(leadgenChangesOf({ object: "user", entry: [] })).toEqual([]);
    expect(leadgenChangesOf("nope")).toEqual([]);
  });
});
