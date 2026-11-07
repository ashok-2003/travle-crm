// The throwaway organization the agent-cases command plays its test chats in: made like the demo's (the platform makes it,
// the platform purges it), with no staff and no subscription, so nothing of an agency's can reach it. The cases fill it.
// Limit: local, by hand, its own throwaway organization only. The purge here skips the export and cancel checks an agency's
// needs, so `removeCaseOrganization` refuses any organization that is not one `createCaseOrganization` made.
import { randomBytes } from "node:crypto";
import { DomainError } from "../kernel/index.js";
import { createOrganizationRecord } from "../identity/index.js";
import { purgeOrganization } from "./purge.js";
import type { PlatformServices } from "./services.js";

export const CASE_ORGANIZATION_NAME = "Agent test chats";
export const CASE_ORGANIZATION_CODE_PREFIX = "CASE";

/** Makes the organization; its code is random, so two runs never meet. */
export async function createCaseOrganization(services: PlatformServices): Promise<string> {
  const code = `${CASE_ORGANIZATION_CODE_PREFIX}${randomBytes(4).toString("hex").toUpperCase()}`;
  return services.platformDb.transaction(async (tx) => {
    const organization = await createOrganizationRecord(tx, {
      name: CASE_ORGANIZATION_NAME,
      code,
      timeZone: "Asia/Kolkata",
      contactEmail: null,
    });
    return organization.id;
  });
}

/**
 * Removes the throwaway organization with everything the cases wrote. Local, by hand, its own throwaway organization
 * only: it throws unless the stored name and code are the ones `createCaseOrganization` gives.
 */
export async function removeCaseOrganization(services: PlatformServices, organizationId: string): Promise<void> {
  const stored = await services.platformDb.transaction((tx) =>
    tx.organization.findUnique({ where: { id: organizationId }, select: { name: true, code: true } }),
  );
  if (stored === null) return;
  if (stored.name !== CASE_ORGANIZATION_NAME || !stored.code.startsWith(CASE_ORGANIZATION_CODE_PREFIX)) {
    throw new DomainError(
      "CONFLICT",
      "NOT_A_CASE_ORGANIZATION",
      "Only the agent test chats' own organization is removed here",
    );
  }
  await purgeOrganization(services, { organizationId, requestedBy: null }, { requireCancelled: false });
}
