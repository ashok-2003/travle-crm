// Every screen's address, in one place, so links and redirects can't drift apart.
import type { PendingStep } from "@travel-crm/contracts/identity";

export const routes = {
  /** The signed-in person's home: their dashboard. */
  home: "/dashboard",
  signIn: "/sign-in",
  twoFactorChallenge: "/sign-in/two-factor",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  changePassword: "/change-password",
  twoFactorSetup: "/two-factor-setup",
  account: "/account",
  staff: "/staff",
  /** A staff import's first step; an import's own page is staffImportRoute(importId). */
  staffImport: "/staff/import",
  roles: "/roles",
  /** The signed-in person's day (release 1): overdue, new leads waiting, due today. */
  today: "/today",
  /** The lead list (release 1); a lead's own page is leadRoute(leadId). */
  leads: "/leads",
  newLead: "/leads/new",
  /** The open leads by stage, as a board (release C). */
  leadsPipeline: "/leads/pipeline",
  /** A lead import's first step; an import's own page is leadImportRoute(importId). */
  leadImport: "/leads/import",
  /** The WhatsApp inbox (release 5); a chat's own page is inboxRoute(conversationId). */
  inbox: "/inbox",
  /** Broadcasts to tagged chats (the Owner and Admins); one broadcast's page is broadcastRoute(id). */
  broadcasts: "/inbox/broadcasts",
  /** A lead's quotations and the money on them (step 3, P0); one quote's page is quoteRoute(quoteId). */
  quotes: "/quotes",
  /** Accepted quotes as bookings the agency confirms and runs (release 6); one booking's page is bookingRoute(bookingId). */
  bookings: "/bookings",
  /** Reports and analytics; one staff member's is staffReportRoute(userId). */
  reports: "/reports",
  /** The agency's money: profit, bookings and running costs (step 6, P0). */
  finance: "/finance",
  settings: "/settings",
  /** The setup checklist: what an organization does first (spec 11). */
  setup: "/setup",
  /** The settings screen's sections (organization/settings/settings-sections.tsx). */
  profile: "/settings/profile",
  branding: "/settings/branding",
  files: "/settings/files",
  documents: "/settings/documents",
  audit: "/settings/audit",
  destinations: "/settings/destinations",
  blockedContacts: "/settings/blocked-contacts",
  /** Google Sheets whose rows become leads; a sheet's own page is sheetRoute(sheetId). */
  leadSources: "/settings/lead-sources",
  /** The agency's website enquiry form: its link, snippet, fields and words (website form spec 3.2). */
  websiteForm: "/settings/lead-sources/website-form",
  /** What the agency's sales do by themselves: the first WhatsApp, follow-ups, reminders, hot leads. */
  salesAutomation: "/settings/sales-automation",
  /** How quotes are paid (the agency's UPI id) and taxed. */
  quoteSettings: "/settings/quotes",
  /** How bookings run: the payment schedule, reminders, the cancellation steps and the review link (release 6). */
  bookingSettings: "/settings/bookings",
  /** Suggest reply's switch and the agency's instructions to the AI. */
  aiSettings: "/settings/ai",
  /** The agency's WhatsApp number and its state. */
  whatsapp: "/settings/whatsapp",
  /** Who new leads that arrive by themselves go to (release C). */
  leadAssignment: "/settings/assignment",
  /** Who on the team gets email and copies of team alerts, as the owner chose. */
  teamNotifications: "/settings/notifications",
  /** Each person's own choice of what they are told, and how (spec 9.4). */
  notificationPreferences: "/account/notifications",
  /** The platform console's dashboard; its other screens are in src/console/routes.ts, which only it imports. */
  console: "/console",
  /** The service worker's fallback for a page never opened before (src/service-worker/strategy.ts). */
  offline: "/offline",
} as const;

/** One staff member's performance and activity. */
export function staffReportRoute(userId: string): string {
  return `${routes.reports}/staff/${encodeURIComponent(userId)}`;
}

/** One quote's page. */
export function quoteRoute(quoteId: string): string {
  return `${routes.quotes}/${encodeURIComponent(quoteId)}`;
}

/** One booking's page. */
export function bookingRoute(bookingId: string): string {
  return `${routes.bookings}/${encodeURIComponent(bookingId)}`;
}

/** A WhatsApp chat's page. */
export function broadcastRoute(broadcastId: string): string {
  return `${routes.broadcasts}/${encodeURIComponent(broadcastId)}`;
}

export function inboxRoute(conversationId: string): string {
  return `${routes.inbox}/${encodeURIComponent(conversationId)}`;
}

/** A lead's page. */
export function leadRoute(leadId: string): string {
  return `${routes.leads}/${encodeURIComponent(leadId)}`;
}

/** A lead import's page, at whichever step it is. */
export function leadImportRoute(importId: string): string {
  return `${routes.leadImport}/${encodeURIComponent(importId)}`;
}

/** A lead export's page, where the bell's "Your leads export is ready" leads. */
export function leadExportRoute(exportId: string): string {
  return `${routes.leads}/exports/${encodeURIComponent(exportId)}`;
}

/** The first step of connecting a Google Sheet: share it and paste its link. */
export const sheetConnectRoute = `${routes.leadSources}/sheets/connect`;

/** A connected sheet's page. */
export function sheetRoute(sheetId: string): string {
  return `${routes.leadSources}/sheets/${encodeURIComponent(sheetId)}`;
}

/** A sheet's connect steps, wherever it stopped (match columns, then the rows already there). */
export function sheetConnectStepRoute(sheetId: string): string {
  return `${sheetRoute(sheetId)}/connect`;
}

/** Matching a connected sheet's columns again. */
export function sheetMatchRoute(sheetId: string): string {
  return `${sheetRoute(sheetId)}/match`;
}

/** The first step of connecting a Facebook Page: Continue with Facebook. */
export const metaConnectRoute = `${routes.leadSources}/meta/connect`;

/** Where Facebook's dialog sends the browser back (apps/api/src/meta-services.ts holds the same path). */
export const metaCallbackRoute = `${routes.leadSources}/meta/callback`;

/** A connected Facebook Page's page. */
export function metaPageRoute(pageId: string): string {
  return `${routes.leadSources}/meta/pages/${encodeURIComponent(pageId)}`;
}

/** Matching a Page's form to our fields: the first time (bring in) and again once brought in (questions). */
export function metaFormRoute(pageId: string, formId: string, step: "bring-in" | "questions"): string {
  return `${metaPageRoute(pageId)}/forms/${encodeURIComponent(formId)}/${step}`;
}

/** The visitor's hosted enquiry form, which anyone with the link opens (no sign-in, no storage). */
export function hostedFormRoute(key: string): string {
  return `/f/${key}`;
}

/** The same form for an iframe on the agency's own website. */
export function embeddedFormRoute(key: string): string {
  return `/embed/${key}`;
}

/** Meta's data-deletion status page: the address the deletion callback answers, opened by a Facebook user, no one of ours. */
export const metaDeletionRoute = "/meta/deletion";

/**
 * Whether a path is a visitor's page (the hosted or embedded enquiry form, or the data-deletion status), which must open
 * no cache, worker or cookie (W29, ruling F3).
 */
export function isPublicFormPath(pathname: string): boolean {
  return pathname.startsWith("/f/") || pathname.startsWith("/embed/") || pathname === metaDeletionRoute;
}

/** A staff import's page, at whichever step it is. */
export function staffImportRoute(importId: string): string {
  return `${routes.staffImport}/${encodeURIComponent(importId)}`;
}

/** A staff export's page. */
export function staffExportRoute(exportId: string): string {
  return `${routes.staff}/exports/${encodeURIComponent(exportId)}`;
}

/**
 * Screens that need no one signed in. Nothing sends anyone away from these, neither a refused call nor another tab
 * signing out: the person may be typing, or reading "Your password is changed".
 */
const publicRoutes: readonly string[] = [
  routes.signIn,
  routes.twoFactorChallenge,
  routes.forgotPassword,
  routes.resetPassword,
  routes.offline,
];

export function isPublicRoute(path: string): boolean {
  return publicRoutes.includes(path);
}

/** Where a person goes to take the step the api insists on, coming back to `from` (an app path) afterwards. */
export function pendingStepRoute(step: PendingStep, from?: string): string {
  const route = step === "CHANGE_PASSWORD" ? routes.changePassword : routes.twoFactorSetup;
  return from && isAppPath(from) ? `${route}?next=${encodeURIComponent(from)}` : route;
}

/** The page this tab shows, as an app path with its query, for coming back to it afterwards. */
export function currentPage(): string {
  return `${location.pathname}${location.search}`;
}

/** The sign-in address that brings the person back to `from` (a path in this app, with its query) afterwards. */
export function signInRoute(from?: string): string {
  return from && isAppPath(from) ? `${routes.signIn}?next=${encodeURIComponent(from)}` : routes.signIn;
}

/**
 * The paths the api serves on the app's address, and everything under them: its tRPC and sign-in, the share links
 * and the webhooks. next.config.ts rewrites them to the api; the service worker stays out of them.
 */
export const API_PATHS = ["/api", "/p", "/webhooks"] as const;

/** Whether an app path ("/console/plans?x=1") is the platform console's, where platform staff work. */
export function isConsolePath(path: string): boolean {
  const { pathname } = new URL(path, PATH_BASE);
  return pathname === routes.console || pathname.startsWith(`${routes.console}/`);
}

/**
 * Any origin of our own would do: a path is checked by whether resolving it against this one stays on it, and read
 * (its pathname) by resolving it here too, as next-path.ts does.
 */
export const PATH_BASE = "https://app.invalid";

/** One slash, then something other than a slash or a backslash (which browsers read as a slash). */
const ONE_LEADING_SLASH = /^\/(?![/\\])/;

/** Whitespace or a backslash anywhere: the URL parser drops tabs and newlines, so "/\t/x" becomes "//x". */
const WHITESPACE_OR_BACKSLASH = /[\s\\]/;

/** C0 and C1 control characters and DEL, tested by code so the check needs no control characters of its own. */
function hasControlCharacter(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

function looksLikeAppPath(text: string): boolean {
  return ONE_LEADING_SLASH.test(text) && !WHITESPACE_OR_BACKSLASH.test(text) && !hasControlCharacter(text);
}

/**
 * A page of this app ("/staff?role=sales"), never another site ("//evil.example", "/\t/evil.example") or the api
 * ("/API/auth/..."), for following ?next= after signing in. The path must look like a path both as written and with
 * its escapes decoded ("/%5Cevil"), and must resolve to our own origin, as the browser will resolve it.
 */
export function isAppPath(path: string): boolean {
  if (!looksLikeAppPath(path)) return false;
  let url: URL;
  let pathname: string;
  try {
    url = new URL(path, PATH_BASE);
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return false; // a malformed escape such as "/%E0"
  }
  return url.origin === PATH_BASE && looksLikeAppPath(pathname) && !pathname.toLowerCase().startsWith("/api");
}
