// Suggest reply's request checks on the real router: the plan's AI module first, then the role's permission, and the
// agency's settings for ai:manage alone (an Owner or Admin), read afresh.
import { describe, expect, it } from "vitest";
import { callerFor } from "./request-probe.js";

/** A refusal's reason, or "allowed" when the check let the call through to the handler (which these stand-ins can't run). */
const checked = async (call: Promise<unknown>) => {
  try {
    await call;
    return "allowed";
  } catch (error) {
    const cause = (error as { cause?: { reason?: string } }).cause;
    return cause?.reason ?? (error as { code: string }).code;
  }
};

describe("Suggest reply's request checks", () => {
  it("refuses an agency whose plan has no AI module, whatever the role holds", async () => {
    const off = callerFor({ modules: ["inbox", "crm"], isOwner: true }).caller.ai;
    expect(await checked(off.suggestReply({ conversationId: crypto.randomUUID() }))).toBe("MODULE_NOT_ON_PLAN");
    expect(await checked(off.status())).toBe("MODULE_NOT_ON_PLAN");
    expect(await checked(off.settings())).toBe("MODULE_NOT_ON_PLAN");
  });

  it("refuses a member without ai:suggest, and one who can't reply in the inbox", async () => {
    const plan = ["ai", "inbox", "crm"] as const;
    const none = callerFor({ modules: [...plan], granted: ["inbox:view", "inbox:reply"] }).caller.ai;
    expect(await checked(none.suggestReply({ conversationId: crypto.randomUUID() }))).toBe("MISSING_PERMISSION");
    const noReply = callerFor({ modules: [...plan], granted: ["ai:suggest", "inbox:view"] }).caller.ai;
    expect(await checked(noReply.suggestReply({ conversationId: crypto.randomUUID() }))).toBe("MISSING_PERMISSION");
  });

  it("lets only ai:manage read or change the agency's settings", async () => {
    const plan = ["ai", "inbox", "crm"] as const;
    const seller = callerFor({ modules: [...plan], granted: ["ai:suggest", "inbox:view", "inbox:reply"] }).caller.ai;
    expect(await checked(seller.settings())).toBe("MISSING_PERMISSION");
    expect(await checked(seller.saveSettings({ enabled: true, scoring: true, instructions: "" }))).toBe(
      "MISSING_PERMISSION",
    );
    const manager = callerFor({ modules: [...plan], granted: ["ai:manage"] });
    // Past the checks, the stand-in has no database: reaching its handler is the proof.
    expect(await checked(manager.caller.ai.settings())).not.toBe("MISSING_PERMISSION");
    expect(manager.reads.sessions).toBeGreaterThan(0);
  });

  it("refuses a suspended or cancelled agency every AI call, and read-only ones a change", async () => {
    const plan = ["ai", "inbox", "crm"] as const;
    const granted = ["ai:suggest", "ai:manage", "inbox:view", "inbox:reply", "leads:view"];
    for (const [status, reason] of [
      ["suspended", "ORGANIZATION_SUSPENDED"],
      ["cancelled", "ORGANIZATION_CANCELLED"],
    ] as const) {
      const { caller } = callerFor({ status, modules: [...plan], granted });
      expect(await checked(caller.ai.suggestReply({ conversationId: crypto.randomUUID() }))).toBe(reason);
      expect(await checked(caller.ai.leadInsight({ leadId: crypto.randomUUID() }))).toBe(reason);
    }
    const readOnly = callerFor({ status: "read_only", modules: [...plan], granted }).caller.ai;
    expect(await checked(readOnly.suggestReply({ conversationId: crypto.randomUUID() }))).toBe(
      "ORGANIZATION_READ_ONLY",
    );
  });

  it("lets only ai:manage change what the AI knows, and ai:suggest with leads:view read a lead's guess", async () => {
    const plan = ["ai", "inbox", "crm"] as const;
    const seller = callerFor({ modules: [...plan], granted: ["ai:suggest", "leads:view"] }).caller.ai;
    expect(await checked(seller.knowledge())).toBe("MISSING_PERMISSION");
    expect(await checked(seller.addKnowledge({ title: "x", body: "y" }))).toBe("MISSING_PERMISSION");
    const noLeads = callerFor({ modules: [...plan], granted: ["ai:suggest"] }).caller.ai;
    expect(await checked(noLeads.leadInsight({ leadId: crypto.randomUUID() }))).toBe("MISSING_PERMISSION");
    const off = callerFor({ modules: ["crm"], granted: ["ai:suggest", "leads:view"] }).caller.ai;
    expect(await checked(off.leadInsight({ leadId: crypto.randomUUID() }))).toBe("MODULE_NOT_ON_PLAN");
  });
});
