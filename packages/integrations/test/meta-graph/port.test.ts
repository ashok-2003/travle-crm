// The MetaGraph port writes only a Page's webhook subscription and a test lead, and never posts (spec 1, ADR 0034).
import { describe, expect, it } from "vitest";
import { metaGraphMethods, MetaGraphError } from "../../src/meta-graph/index.js";

describe("the MetaGraph port", () => {
  it("lists its methods: reads, the subscription, and the one test lead", () => {
    const writes = metaGraphMethods.filter((name) =>
      /^(subscribe|unsubscribe|create|post|send|reply|delete|update)/.test(name),
    );
    expect(writes).toEqual(["subscribePage", "unsubscribePage", "createTestLead"]);
  });

  it("builds an error from the reason and Meta's codes only", () => {
    const error = new MetaGraphError("token_invalid", { code: 190, subcode: 463, type: "OAuthException" });
    expect(error.message).toBe("Meta Graph: token_invalid (190/463)");
    expect(error.type).toBe("OAuthException");
  });
});
