// Release 1's procedures (spec 6): every one is on the crm plan module, and each needs its own permission (R17-R20):
// leads:view to read and to work tasks and Today, leads:create to add, leads:edit to change, leads:assign to
// reassign and block, settings:manage for destinations' rename and merge. A member holding every other permission is
// refused before the handler runs.
import {
  PermissionSet,
  permissions,
  type Identity,
  type MemberAccess,
  type Permission,
} from "@travel-crm/domain/identity";
import { lifecycleAccessOf } from "@travel-crm/domain/subscriptions";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Context } from "../src/context.js";
import { appRouter } from "../src/routers/app-router.js";
import { t } from "../src/trpc.js";
import { outcome } from "./request-probe.js";

const crmRouters = ["leads", "blockedContacts", "today", "tasks", "destinations"];

/** Every procedure of the app router by its dotted path, with its meta (tRPC 11.19 keeps them flat at run time). */
const procedures = Object.entries(
  appRouter._def.procedures as unknown as Record<string, { _def: { meta?: { planModule?: unknown } } }>,
);

const required: Record<string, Permission> = {
  "destinations.search": "leads:view",
  "destinations.rename": "settings:manage",
  "destinations.merge": "settings:manage",
  "tasks.add": "leads:view",
  "tasks.complete": "leads:view",
  "tasks.snooze": "leads:view",
  "leads.list": "leads:view",
  "leads.counts": "leads:view",
  "leads.owners": "leads:view",
  "leads.knownContact": "leads:view",
  "leads.get": "leads:view",
  "leads.timeline": "leads:view",
  "leads.create": "leads:create",
  "leads.addNote": "leads:edit",
  "leads.moveStage": "leads:edit",
  "leads.reopen": "leads:edit",
  "leads.editTrip": "leads:edit",
  "leads.editPerson": "leads:edit",
  "leads.addWork": "leads:edit",
  "leads.reassign": "leads:assign",
  "leads.block": "leads:assign",
  "leads.bulkMoveStage": "leads:edit",
  "leads.bulkReassign": "leads:assign",
  "leads.bulkAddWork": "leads:edit",
  "blockedContacts.list": "leads:assign",
  "blockedContacts.unblock": "leads:assign",
  "today.summary": "leads:view",
  "today.section": "leads:view",
};

/** A caller of the app router for a member holding every permission but one, on a plan with every module. */
function callerWithout(missing: Permission) {
  const member: MemberAccess = {
    organizationId: "0199e7a0-0000-7000-8000-0000000000d1",
    userId: "0199e7a0-0000-7000-8000-0000000000d2",
    memberId: "0199e7a0-0000-7000-8000-0000000000d3",
    source: "web",
    impersonatedBy: null,
    role: { key: "custom", name: "Custom", isOwner: false },
    permissions: PermissionSet.of(
      permissions.filter((permission) => permission !== missing).map((permission) => ({ permission, scope: "all" })),
    ),
    mustChangePassword: false,
    twoFactorEnabled: false,
    organizationRequiresTwoFactor: false,
  };
  const session = { activeOrganizationId: member.organizationId, impersonatedBy: null };
  const ctx = {
    identity: {
      resolveAccess: () => Promise.resolve(member),
      recordActivity: () => Promise.resolve(),
    } as unknown as Identity,
    subscriptions: {
      entitlementsOf: () =>
        Promise.resolve({
          status: "active",
          access: lifecycleAccessOf("active"),
          planName: "Everything",
          modules: new Set(["crm", "quotes", "bookings", "departures", "suppliers", "accounts"]),
          limits: { seats: 5, whatsappNumbers: 1, storageBytes: 1 },
          trialEndsOn: null,
          paidThrough: null,
          nextChangeOn: null,
        }),
    },
    headers: new Headers(),
    resHeaders: new Headers(),
    session,
    user: { id: member.userId },
  } as unknown as Context;
  return t.createCallerFactory(appRouter)(ctx) as unknown as Record<
    string,
    Record<string, (input?: unknown) => Promise<string>>
  >;
}

describe("release 1's procedures", () => {
  it("puts every leads, blockedContacts, today, tasks and destinations procedure on the crm plan module", () => {
    const crm = procedures.filter(([path]) => crmRouters.includes(path.split(".")[0] ?? ""));
    expect(crm.map(([path]) => path).sort()).toEqual(Object.keys(required).sort());
    expect(crm.filter(([, procedure]) => procedure._def.meta?.planModule !== "crm").map(([path]) => path)).toEqual([]);
  });

  it("refuses each one without its permission, before its handler runs", async () => {
    for (const [path, permission] of Object.entries(required)) {
      const [router = "", name = ""] = path.split(".");
      const call = callerWithout(permission)[router]?.[name];
      expect(call, path).toBeDefined();
      if (call) expect(await outcome(call()), path).toBe("MISSING_PERMISSION");
    }
  });

  it("answers every assignment procedure as not available yet while automatic assignment is off", async () => {
    const assignment = callerWithout("leads:create").assignment ?? {};
    const inputs: Record<string, unknown> = {
      get: undefined,
      save: { mode: "owner", slowReplyMinutes: null, rules: [], pool: [] },
      mine: undefined,
      setAway: { awayUntil: null },
    };
    for (const [name, input] of Object.entries(inputs)) {
      const call = assignment[name];
      expect(call, name).toBeDefined();
      if (call) expect(await outcome(call(input)), name).toBe("NOT_AVAILABLE_YET");
    }
  });

  it("asks the bulk changes for the permission of the change, nothing more: reassigning many needs leads:assign", async () => {
    const leadIds = [randomUUID()];
    // A reassigner without leads:edit gets as far as the handler; an editor without leads:assign does not.
    const reassigner = callerWithout("leads:edit").leads?.bulkReassign;
    const editor = callerWithout("leads:assign").leads;
    expect(
      await outcome(reassigner?.({ leadIds, ownerUserId: randomUUID() }) ?? Promise.resolve("no caller")),
    ).not.toBe("MISSING_PERMISSION");
    expect(
      await outcome(editor?.bulkReassign?.({ leadIds, ownerUserId: randomUUID() }) ?? Promise.resolve("")),
    ).toBe("MISSING_PERMISSION");
    expect(await outcome(editor?.bulkMoveStage?.({ leadIds, stage: "contacted" }) ?? Promise.resolve(""))).not.toBe(
      "MISSING_PERMISSION",
    );
  });

  it("refuses more than 200 leads in one bulk call, before the handler runs", async () => {
    const leadIds = Array.from({ length: 201 }, () => randomUUID());
    const leads = callerWithout("leads:create").leads ?? {};
    const inputs: Record<string, unknown> = {
      bulkMoveStage: { leadIds, stage: "contacted" },
      bulkReassign: { leadIds, ownerUserId: randomUUID() },
      bulkAddWork: { leadIds, kind: "task", title: "Call", due: { on: "2026-10-23", at: "10:00" } },
    };
    for (const [name, input] of Object.entries(inputs)) {
      expect(await outcome(leads[name]?.(input) ?? Promise.resolve("no caller")), name).toBe("BAD_REQUEST");
    }
  });
});
