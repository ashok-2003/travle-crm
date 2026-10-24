// Request checks 2 and 3 (spec 6.5, 7.3): which calls each lifecycle state allows, and which plan module each of the
// catalog's permissions needs.
import { describe, expect, it } from "vitest";
import { moduleOf, permissions } from "../../src/identity/index.js";
import {
  assertLifecycleAllows,
  assertModulesOnPlan,
  assertOnPlan,
  lifecycleAccessOf,
  planModuleOf,
  type CallKind,
  type Entitlements,
  type ProcedureModule,
} from "../../src/subscriptions/index.js";
import type { SubscriptionStatus } from "@travel-crm/contracts/subscriptions";

const entitlements = (status: SubscriptionStatus, modules: Entitlements["modules"] = new Set()): Entitlements => ({
  status,
  access: lifecycleAccessOf(status),
  planName: "Starter",
  modules,
  limits: { seats: 5, whatsappNumbers: 1, storageBytes: 1 },
  trialEndsOn: null,
  paidThrough: null,
  nextChangeOn: null,
});

/** The domain error's code and reason when check() refuses, or "allowed". */
function refusal(check: () => void): string {
  try {
    check();
    return "allowed";
  } catch (error) {
    const { code, reason } = error as { code: string; reason: string };
    return `${code} ${reason}`;
  }
}

/** The reason a call is refused with, or "allowed". */
function outcome(status: SubscriptionStatus, kind: CallKind, isOwner = false): string {
  return refusal(() => {
    assertLifecycleAllows(entitlements(status), { kind, isOwner });
  }).replace(/^FORBIDDEN /, "");
}

describe("request check 2: the organization's lifecycle state", () => {
  it("allows everything while on trial, active or past due", () => {
    for (const status of ["trial", "active", "past_due"] as const) {
      expect([outcome(status, "view"), outcome(status, "change"), outcome(status, "export")]).toEqual([
        "allowed",
        "allowed",
        "allowed",
      ]);
    }
  });

  it("allows views and exports, not changes, while read-only", () => {
    expect([outcome("read_only", "view"), outcome("read_only", "export"), outcome("read_only", "change")]).toEqual([
      "allowed",
      "allowed",
      "ORGANIZATION_READ_ONLY",
    ]);
  });

  it("allows only the Owner's exports while suspended", () => {
    expect(outcome("suspended", "export", true)).toBe("allowed");
    expect([outcome("suspended", "export"), outcome("suspended", "view", true)]).toEqual([
      "ORGANIZATION_SUSPENDED",
      "ORGANIZATION_SUSPENDED",
    ]);
  });

  it("allows revoking access while read-only, and to the Owner while suspended: security outranks billing", () => {
    expect([outcome("read_only", "revoke"), outcome("suspended", "revoke", true)]).toEqual(["allowed", "allowed"]);
    expect([outcome("suspended", "revoke"), outcome("cancelled", "revoke", true)]).toEqual([
      "ORGANIZATION_SUSPENDED",
      "ORGANIZATION_CANCELLED",
    ]);
  });

  it("allows nothing once cancelled, and nothing without a subscription, but what every state allows", () => {
    expect(outcome("cancelled", "export", true)).toBe("ORGANIZATION_CANCELLED");
    expect(outcome("cancelled", "always")).toBe("allowed");
    expect(
      refusal(() => {
        assertLifecycleAllows(null, { kind: "view", isOwner: true });
      }),
    ).toBe("FORBIDDEN NO_SUBSCRIPTION");
    expect(
      refusal(() => {
        assertLifecycleAllows(null, { kind: "always", isOwner: false });
      }),
    ).toBe("allowed");
  });
});

describe("request check 3: the module on the plan", () => {
  it("knows the plan module of every permission in the catalog, the Foundation's own being on every plan", () => {
    for (const permission of permissions) {
      expect(() => planModuleOf(moduleOf(permission)), permission).not.toThrow();
    }
    expect(planModuleOf(moduleOf("leads:create"))).toBe("crm");
    expect(planModuleOf(moduleOf("inbox:reply"))).toBe("inbox");
    expect(planModuleOf(moduleOf("staff:manage"))).toBeNull();
    expect(() => planModuleOf("teleport")).toThrow(/No plan module/);
  });

  it("refuses a permission whose module is off the plan, naming the module", () => {
    const starter = entitlements("active", new Set(["crm"]));
    const onPlan = (permissionModules: string[], plan: Entitlements | null = starter) =>
      refusal(() => {
        assertModulesOnPlan(plan, permissionModules);
      });
    expect(onPlan(["leads", "staff"])).toBe("allowed");
    expect(onPlan(["bookings"])).toBe("FEATURE_LOCKED MODULE_NOT_ON_PLAN");
    expect(() => {
      assertModulesOnPlan(starter, ["bookings", "accounts"]);
    }).toThrow("Not on this organization's plan: bookings, accounts");
    expect(onPlan(["leads"], null)).toBe("FEATURE_LOCKED MODULE_NOT_ON_PLAN");
    expect(onPlan(["roles"], null)).toBe("allowed");
  });

  it("refuses a procedure's own plan module off the plan, and never the Foundation's own", () => {
    const starter = entitlements("active", new Set(["crm"]));
    const onPlan = (planModules: ProcedureModule[], plan: Entitlements | null = starter) =>
      refusal(() => {
        assertOnPlan(plan, planModules);
      });
    expect(onPlan(["crm"])).toBe("allowed");
    expect(onPlan(["quotes"])).toBe("FEATURE_LOCKED MODULE_NOT_ON_PLAN");
    expect(onPlan(["core"], null)).toBe("allowed");
  });
});
