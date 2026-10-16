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
  log: "/console/log",
  staff: "/console/staff",
} as const;
