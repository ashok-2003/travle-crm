// The plan's limits as the modules that enforce them take them (spec 7.2): identity's seat limit and the files
// module's storage limit, each read from the organization's entitlements when it is needed.
import type { SubscriptionAccess } from "./entitlements.js";

/** Functions, not methods, so they can be handed on as they are. */
export interface PlanLimits {
  /** The seats the organization's plan gives, extra seats included; null without a subscription. */
  readonly seats: (organizationId: string) => Promise<number | null>;
  /** The bytes of files the plan lets the organization keep; null without a subscription. */
  readonly storageBytes: (organizationId: string) => Promise<number | null>;
}

/**
 * Null without a subscription means no limit here: request check 2 already refuses every change such an
 * organization's staff make.
 */
export function planLimits(access: SubscriptionAccess): PlanLimits {
  const limitsOf = async (organizationId: string) => (await access.entitlementsOf(organizationId))?.limits ?? null;
  return {
    seats: async (organizationId) => (await limitsOf(organizationId))?.seats ?? null,
    storageBytes: async (organizationId) => (await limitsOf(organizationId))?.storageBytes ?? null,
  };
}
