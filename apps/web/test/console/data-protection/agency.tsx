// An organization on the data protection screen, as the console's api gives it: its details with today's subscription
// status, its exports, and the platform log's entries a job's result is read from; and the screen rendered for it.
import type { OrganizationExport, PlatformLogEntry } from "@travel-crm/contracts/platform";
import type { SubscriptionStatus } from "@travel-crm/contracts/subscriptions";
import { DataProtectionScreen } from "@/console/data-protection/data-protection-screen";
import { stubApi, type Answer } from "../../support/api-stub";
import { platformStaff } from "../../support/platform-staff";
import { renderConsole } from "../plans/render-console";

export const organizationId = "0199a000-0000-7000-8000-000000000002";
const HOUR = 60 * 60 * 1000;

export function details(status: SubscriptionStatus | null = "active"): Answer {
  return {
    data: {
      organization: { id: organizationId, name: "Sharma Travels", code: "SHARMA", timeZone: "Asia/Kolkata" },
      profile: null,
      subscription: status === null ? null : { subscription: { organizationId, status }, payments: [] },
    },
  };
}

export function anExport(overrides: Partial<OrganizationExport> = {}): OrganizationExport {
  const requestedAt = new Date(Date.now() - 2 * HOUR);
  return {
    exportId: "0199a000-0000-7000-8000-0000000000e1",
    organizationId,
    state: "done",
    requestedBy: platformStaff("super-admin").userId,
    requestedAt: requestedAt.toISOString(),
    completedAt: new Date(Date.now() - HOUR).toISOString(),
    expiresAt: new Date(requestedAt.getTime() + 7 * 24 * HOUR).toISOString(),
    parts: 3,
    rows: 1234,
    people: 4,
    files: 2,
    ...overrides,
  };
}

/** A platform log entry about the organization, newest first as log.list gives them. */
export function logged(action: string, overrides: Partial<PlatformLogEntry> = {}): PlatformLogEntry {
  return {
    id: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    actorUserId: platformStaff("super-admin").userId,
    action,
    targetType: "organization",
    targetId: organizationId,
    targetOrganizationId: organizationId,
    before: null,
    after: null,
    ...overrides,
  };
}

export function openScreen(answers: Record<string, Answer>, staff = platformStaff("super-admin")) {
  const api = stubApi({
    "platform.organizations.get": details(),
    "platform.dataProtection.exports": { data: [] },
    "platform.log.list": { data: { entries: [], nextCursor: null } },
    ...answers,
  });
  renderConsole(<DataProtectionScreen organizationId={organizationId} />, staff);
  return api;
}
