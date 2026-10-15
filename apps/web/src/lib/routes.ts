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
} as const;

/** Screens for people who aren't signed in. A refused call never sends anyone away from these. */
const publicRoutes: readonly string[] = [
  routes.signIn,
  routes.twoFactorChallenge,
  routes.forgotPassword,
  routes.resetPassword,
];

export function isPublicRoute(path: string): boolean {
  return publicRoutes.includes(path);
}

/** Where a person goes to take the step the api insists on. */
export function pendingStepRoute(step: PendingStep): string {
  return step === "CHANGE_PASSWORD" ? routes.changePassword : routes.twoFactorSetup;
}

/** The sign-in address that brings the person back to `from` (a path in this app) afterwards. */
export function signInRoute(from?: string): string {
  return from && isAppPath(from) ? `${routes.signIn}?next=${encodeURIComponent(from)}` : routes.signIn;
}

/** A path inside this app ("/staff"), never another site ("//evil.example", "https://..."). */
export function isAppPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\");
}
