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
  roles: "/roles",
  settings: "/settings",
  /** The setup checklist: what an organization does first (spec 11). */
  setup: "/setup",
  /** The settings screen's sections (organization/settings/settings-sections.tsx). */
  profile: "/settings/profile",
  branding: "/settings/branding",
  files: "/settings/files",
  documents: "/settings/documents",
  audit: "/settings/audit",
  /** Each person's own choice of what they are told, and how (spec 9.4). */
  notificationPreferences: "/account/notifications",
  /** The platform console's dashboard; its other screens are in src/console/routes.ts, which only it imports. */
  console: "/console",
  /** The service worker's fallback for a page never opened before (src/service-worker/strategy.ts). */
  offline: "/offline",
} as const;

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

/** The sign-in address that brings the person back to `from` (a path in this app, with its query) afterwards. */
export function signInRoute(from?: string): string {
  return from && isAppPath(from) ? `${routes.signIn}?next=${encodeURIComponent(from)}` : routes.signIn;
}

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
