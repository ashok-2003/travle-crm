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
  /** A super admin's invoices made by hand, and the firm's billing details they carry. */
  invoices: "/console/invoices",
  billingDetails: "/console/invoices/billing-details",
  jobs: "/console/jobs",
  /** What is broken now and the last week's incidents, and a super admin's platform alerts on this device. */
  updates: "/console/updates",
  /** The emails that failed, a super admin's; each one's page under it. */
  emails: "/console/emails",
  email: (emailId: string) => `/console/emails/${emailId}`,
  /** The AI agent's turns, a super admin's, listed under an organization. */
  aiTraces: (organizationId: string, conversationId?: string) =>
    `/console/organizations/${organizationId}/ai-traces${conversationId === undefined ? "" : `?chat=${conversationId}`}`,
  aiTrace: (organizationId: string, traceId: string) => `/console/organizations/${organizationId}/ai-traces/${traceId}`,
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
