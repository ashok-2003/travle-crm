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
    expect(await checked(seller.saveSettings({ enabled: true, instructions: "" }))).toBe("MISSING_PERMISSION");
    const manager = callerFor({ modules: [...plan], granted: ["ai:manage"] });
    // Past the checks, the stand-in has no database: reaching its handler is the proof.
    expect(await checked(manager.caller.ai.settings())).not.toBe("MISSING_PERMISSION");
    expect(manager.reads.sessions).toBeGreaterThan(0);
  });
});
