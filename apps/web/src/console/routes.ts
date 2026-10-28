// Every console screen's address, in one place, so links and redirects can't drift apart. Only the console's own code
// imports it (dependency-cruiser); the app reaches the console by routes.console alone.
import { routes } from "@/lib/routes";

export const consoleRoutes = {
  home: routes.console,
  /** Under it, each organization's pages. */
  organizations: "/console/organizations",
  onboard: "/console/organizations/new",
  organization: (organizationId: string) => `/console/organizations/${organizationId}`,
  dataProtection: (organizationId: string) => `/console/organizations/${organizationId}/data-protection`,
  plans: "/console/plans",
  jobs: "/console/jobs",
  /** The WhatsApp numbers agencies use, and the webhook MSG91 calls. */
  whatsapp: "/console/whatsapp",
  log: "/console/log",
  /** The invite-only program: invites and how their links have done. */
  invites: "/console/invites",
  /** How every organization uses the product; one organization's under it. */
  usage: "/console/usage",
  organizationUsage: (organizationId: string) => `/console/usage/${organizationId}`,
  staff: "/console/staff",
} as const;
