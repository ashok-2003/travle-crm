// Request checks 2 and 3 of spec 6.5: the organization's state today allows the call, and the plan module the call
// belongs to, and those its permissions belong to, are on its plan. The api applies them in its procedure builders.
import type { PlanModule } from "@travel-crm/contracts/subscriptions";
import { DomainError } from "../kernel/index.js";
import type { Entitlements } from "./entitlements.js";

/**
 * What a call does, for the lifecycle: reads, changes, exports (download links, the lists of papers and issued
 * documents), takes someone's access away or finds whom to cut off (removing staff and listing them, a new temporary
 * password, requiring two-factor, a document's share links and turning one off), or something every state allows
 * (me.get and the subscription's own status, so the app can say why the rest is refused).
 */
export type CallKind = "view" | "change" | "export" | "revoke" | "always";

/**
 * Check 2 (spec 7.3): read-only allows views, exports and revoking access; suspended only the Owner's exports and
 * revocations; cancelled nothing. Revoking is never a billing matter: an agency must be able to cut off someone who
 * left, whether or not it has paid (ADR 0021).
 */
export function assertLifecycleAllows(
  entitlements: Entitlements | null,
  call: { kind: CallKind; isOwner: boolean },
): void {
  if (call.kind === "always") return;
  if (!entitlements) {
    throw new DomainError("FORBIDDEN", "NO_SUBSCRIPTION", "This organization has no subscription");
  }
  switch (entitlements.access) {
    case "full":
      return;
    case "read_only":
      if (call.kind !== "change") return;
      throw new DomainError("FORBIDDEN", "ORGANIZATION_READ_ONLY", "This organization is read-only until it pays");
    case "export_only":
      if ((call.kind === "export" || call.kind === "revoke") && call.isOwner) return;
      throw new DomainError("FORBIDDEN", "ORGANIZATION_SUSPENDED", "This organization is suspended until it pays");
    case "locked":
      throw new DomainError("FORBIDDEN", "ORGANIZATION_CANCELLED", "This organization's subscription has ended");
  }
}

/**
 * The plan module each permission module belongs to; null for the Foundation's own, which every plan includes. A
 * module missing here throws: request-rules.test.ts checks every permission in the catalog has one.
 */
const planModuleByPermissionModule = new Map<string, PlanModule | null>([
  ["staff", null],
  ["roles", null],
  ["settings", null],
  ["audit", null],
  ["money", null],
  ["documents", null],
  ["leads", "crm"],
  ["inbox", "inbox"],
  ["quotes", "quotes"],
  ["bookings", "bookings"],
  ["departures", "departures"],
  ["suppliers", "suppliers"],
  ["accounts", "accounts"],
  ["ai", "ai"],
]);

export function planModuleOf(permissionModule: string): PlanModule | null {
  const planModule = planModuleByPermissionModule.get(permissionModule);
  if (planModule === undefined) throw new Error(`No plan module is set for permissions of ${permissionModule}`);
  return planModule;
}

/**
 * What a procedure declares for check 3: the plan module it belongs to, or "core" for the Foundation's own features,
 * which every plan has.
 */
export type ProcedureModule = PlanModule | "core";

/** Check 3: every one of these plan modules is on the plan, or switched on early. */
export function assertOnPlan(entitlements: Entitlements | null, planModules: readonly ProcedureModule[]): void {
  const missing = planModules.filter(
    (planModule): planModule is PlanModule => planModule !== "core" && !entitlements?.modules.has(planModule),
  );
  if (missing.length > 0) {
    throw new DomainError(
      "FEATURE_LOCKED",
      "MODULE_NOT_ON_PLAN",
      `Not on this organization's plan: ${missing.join(", ")}`,
    );
  }
}

/** Check 3 for permissions: every module they belong to is on the plan, the Foundation's own always. */
export function assertModulesOnPlan(entitlements: Entitlements | null, permissionModules: readonly string[]): void {
  assertOnPlan(
    entitlements,
    permissionModules.map((permissionModule) => planModuleOf(permissionModule) ?? "core"),
  );
}
