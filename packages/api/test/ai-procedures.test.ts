// Suggest reply's request checks on the real router: the plan's AI module first, then the role's permission, and the
// agency's settings for ai:manage alone (an Owner or Admin), read afresh.
import { describe, expect, it } from "vitest";
import { appRouter } from "../src/routers/app-router.js";
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
    expect(await checked(seller.saveSettings({ enabled: true, scoring: true }))).toBe("MISSING_PERMISSION");
    const manager = callerFor({ modules: [...plan], granted: ["ai:manage"] });
    // Past the checks, the stand-in has no database: reaching its handler is the proof.
    expect(await checked(manager.caller.ai.settings())).not.toBe("MISSING_PERMISSION");
    expect(manager.reads.sessions).toBeGreaterThan(0);
  });

  it("refuses the instructions and custom-trips fields the settings no longer hold", async () => {
    const manager = callerFor({ modules: ["ai", "inbox", "crm"], granted: ["ai:manage"] }).caller.ai;
    const old = { enabled: true, scoring: true, instructions: "x" } as never;
    expect(await checked(manager.saveSettings(old))).toBe("BAD_REQUEST");
    expect(await checked(manager.saveSettings({ enabled: true, scoring: true, customTrips: true } as never))).toBe(
      "BAD_REQUEST",
    );
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

describe("AI on a departure: request checks", () => {
  const plan = ["ai", "departures", "crm"] as const;
  const id = () => crypto.randomUUID();

  it("needs both the AI and the departures modules on the plan", async () => {
    const granted = [
      "ai:suggest",
      "departures:view",
      "departures:edit",
      "departures:create",
      "leads:view",
      "leads:edit",
    ];
    const noAi = callerFor({ modules: ["departures", "crm"], granted }).caller.ai.departures;
    expect(await checked(noAi.readRoomRequests({ departureId: id() }))).toBe("MODULE_NOT_ON_PLAN");
    expect(await checked(noAi.findInterested({ departureId: id() }))).toBe("MODULE_NOT_ON_PLAN");
    const noDepartures = callerFor({ modules: ["ai", "crm"], granted }).caller.ai.departures;
    expect(await checked(noDepartures.readRoomRequests({ departureId: id() }))).toBe("MODULE_NOT_ON_PLAN");
    expect(await checked(noDepartures.writeSeatMessage({ departureId: id(), leadId: id() }))).toBe(
      "MODULE_NOT_ON_PLAN",
    );
  });

  it("lets only departures:edit read room requests, and only departures:create with leads:view find people", async () => {
    const seller = callerFor({
      modules: [...plan],
      granted: ["ai:suggest", "departures:view", "departures:create", "leads:view"],
    }).caller.ai.departures;
    expect(await checked(seller.readRoomRequests({ departureId: id() }))).toBe("MISSING_PERMISSION");
    expect(await checked(seller.findInterested({ departureId: id() }))).not.toBe("MISSING_PERMISSION");
    const noAi = callerFor({ modules: [...plan], granted: ["departures:view", "departures:edit"] }).caller.ai
      .departures;
    expect(await checked(noAi.readRoomRequests({ departureId: id() }))).toBe("MISSING_PERMISSION");
    const noLeads = callerFor({
      modules: [...plan],
      granted: ["ai:suggest", "departures:view", "departures:create"],
    }).caller.ai.departures;
    expect(await checked(noLeads.findInterested({ departureId: id() }))).toBe("MISSING_PERMISSION");
    expect(await checked(noLeads.writeSeatMessage({ departureId: id(), leadId: id() }))).toBe("MISSING_PERMISSION");
    // Marking an offer sent adds a note to the lead's timeline, so it needs leads:edit as well.
    const noEdit = callerFor({
      modules: [...plan],
      granted: ["ai:suggest", "departures:view", "departures:create", "leads:view"],
    }).caller.ai.departures;
    expect(await checked(noEdit.markOfferSent({ departureId: id(), leadId: id(), fillId: id(), text: "Hello" }))).toBe(
      "MISSING_PERMISSION",
    );
  });

  it("refuses a read-only agency the AI's calls and the offer's mark", async () => {
    const granted = [
      "ai:suggest",
      "departures:view",
      "departures:edit",
      "departures:create",
      "leads:view",
      "leads:edit",
    ];
    const { caller } = callerFor({ status: "read_only", modules: [...plan], granted });
    expect(await checked(caller.ai.departures.readRoomRequests({ departureId: id() }))).toBe("ORGANIZATION_READ_ONLY");
    expect(await checked(caller.ai.departures.writeSeatMessage({ departureId: id(), leadId: id() }))).toBe(
      "ORGANIZATION_READ_ONLY",
    );
    expect(
      await checked(
        caller.departures.rooming.setRequests({
          departureId: id(),
          changes: [{ travellerId: id(), roomRequest: "single_room" }],
        }),
      ),
    ).toBe("ORGANIZATION_READ_ONLY");
  });
});

describe("the earlier agents' settings procedures", () => {
  it("are gone: what an agency set or saw for them has no endpoint", () => {
    const procedures = Object.keys(appRouter._def.procedures);
    const gone = [
      "media",
      "requestMedia",
      "confirmMedia",
      "updateMedia",
      "deleteMedia",
      "mediaLink",
      "autopilot",
      "saveAutopilot",
      "learnings",
      "setLearning",
      "learnNow",
      "learnVoice",
      "clearVoice",
      "setChatPersona",
      "learnChatVoice",
      "clearChatVoice",
    ];
    for (const name of gone) expect(procedures).not.toContain(`ai.${name}`);
  });

  it("keep the knowledge documents that package drafts are written from", () => {
    const procedures = Object.keys(appRouter._def.procedures);
    for (const name of ["knowledge", "addKnowledge", "requestKnowledgeDocument", "confirmKnowledgeDocument"]) {
      expect(procedures).toContain(`ai.${name}`);
    }
  });
});
