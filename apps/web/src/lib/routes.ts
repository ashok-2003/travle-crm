// Every screen's address, in one place, so links and redirects can't drift apart.
import type { PendingStep } from "@travel-crm/contracts/identity";

export const routes = {
  home: "/",
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
  /** A lead import's first step; an import's own page is leadImportRoute(importId). */
  leadImport: "/leads/import",
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
  /** Each person's own choice of what they are told, and how (spec 9.4). */
  notificationPreferences: "/account/notifications",
  /** The platform console's dashboard; its other screens are in src/console/routes.ts, which only it imports. */
  console: "/console",
  /** The service worker's fallback for a page never opened before (src/service-worker/strategy.ts). */
  offline: "/offline",
} as const;

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
