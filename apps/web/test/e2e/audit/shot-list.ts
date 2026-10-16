// Every shot the visual audit takes, in the order it takes them: its file name, the screen it shows and who it is
// taken as. A shot's number is its place here (camera.ts), so a re-run, whole or in parts, names each file the same;
// write-index.ts lists them, and any the run didn't take, from here. The two-factor screens are shot only while
// features.twoFactor is on: off, nobody can reach them.
import { features } from "@travel-crm/contracts/features";

export interface Shot {
  name: string;
  screen: string;
  as: string;
  /** A shot of one project's layout only, such as the phone's bottom bar. */
  only?: "phone" | "desktop";
}

const signedOut = "signed out";
const owner = "Asha Sharma, Owner";
const sales = "Ravi Kumar, Sales";
const superAdmin = "Kavita Rao, super admin";
const support = "Arjun Nair, support";

const TWO_FACTOR_SHOTS = [
  { name: "two-factor-setup", screen: "Two-factor setup, the password step", as: `${sales}, two-factor required` },
  { name: "two-factor-setup-qr", screen: "Two-factor setup, the QR code", as: `${sales}, two-factor required` },
  {
    name: "two-factor-backup-codes",
    screen: "Two-factor setup, the backup codes",
    as: `${sales}, two-factor required`,
  },
  { name: "two-factor-challenge", screen: "The two-factor challenge at sign-in", as: `${owner}, two-factor on` },
] as const satisfies readonly Shot[];

export const SHOTS = [
  { name: "sign-in-email", screen: "Sign in, the Email tab", as: signedOut },
  { name: "sign-in-code", screen: "Sign in, the Organization code tab", as: signedOut },
  { name: "forgot-password", screen: "Forgot password", as: signedOut },
  { name: "forgot-password-sent", screen: "Forgot password, the link sent", as: signedOut },
  { name: "reset-password", screen: "Reset password, from the emailed link (Mailpit)", as: signedOut },
  { name: "reset-password-done", screen: "Reset password, saved", as: signedOut },
  { name: "reset-password-expired", screen: "Reset password, an expired or used link", as: signedOut },
  { name: "offline", screen: "The offline page", as: signedOut },
  { name: "not-found", screen: "An unknown page (404)", as: signedOut },
  { name: "share-link-not-found", screen: "A share link that doesn't work (/p/<token>)", as: "a customer, signed out" },
  { name: "change-password", screen: "Change password, with a temporary one", as: "Meera Iyer, Operations, new" },
  ...(features.twoFactor ? TWO_FACTOR_SHOTS : []),
  { name: "account", screen: "Your account", as: features.twoFactor ? `${owner}, two-factor on` : owner },
  { name: "home-checklist", screen: "Home with the Owner's setup checklist", as: owner },
  { name: "setup", screen: "The setup checklist", as: owner },
  { name: "settings", screen: "Settings", as: owner },
  { name: "business-profile", screen: "Business profile, the bank number masked", as: owner },
  { name: "business-files", screen: "Business files, two uploaded, the sensitivity choice", as: owner },
  { name: "branding", screen: "Branding, with a logo and the sample preview ready", as: owner },
  { name: "documents", screen: "Documents, the sample quotation", as: owner },
  { name: "documents-share-dialog", screen: "Documents, the share dialog with a new link", as: owner },
  { name: "roles", screen: "Roles", as: owner },
  { name: "roles-new-dialog", screen: "Roles, the New role dialog", as: owner },
  { name: "role-editor", screen: "The role editor (Sales)", as: owner },
  { name: "staff", screen: "Staff", as: owner },
  { name: "staff-add-dialog", screen: "Staff, the Add staff dialog, filled in", as: owner },
  { name: "staff-added-dialog", screen: "Staff, the handover after adding", as: owner },
  { name: "home-done", screen: "Home once setup is done", as: owner },
  { name: "notifications-bell", screen: "The notification bell, open", as: owner },
  { name: "notification-preferences", screen: "Notification preferences, with the push card", as: owner },
  { name: "audit-log", screen: "The audit log, an entry opened", as: owner },
  { name: "top-bar", screen: "The phone's top bar (the element)", as: owner, only: "phone" },
  { name: "bottom-bar", screen: "The phone's bottom bar (the element)", as: owner, only: "phone" },
  { name: "more-sheet", screen: "The phone's More sheet", as: owner, only: "phone" },
  { name: "sidebar", screen: "The desktop sidebar (the element)", as: owner, only: "desktop" },
  { name: "sales-home", screen: "Home", as: sales },
  { name: "sales-not-allowed", screen: "A screen the role can't open (Staff)", as: sales },
  { name: "console-not-for-agency", screen: "The console, opened by an agency's Owner", as: owner },
  { name: "banner-trial-ending", screen: "Home, the trial-ending banner", as: owner },
  { name: "banner-payment-due", screen: "Home, the payment-due banner", as: owner },
  { name: "banner-read-only", screen: "Staff, the read-only banner", as: owner },
  { name: "suspended-member", screen: "Suspended, the locked screen", as: sales },
  { name: "suspended-owner", screen: "Suspended, the locked screen with the way to Staff", as: owner },
  { name: "cancelled", screen: "Cancelled, the locked screen", as: "Kiran Rao, Admin" },
  { name: "console-dashboard", screen: "Console dashboard, with organizations", as: superAdmin },
  { name: "console-more-sheet", screen: "Console, the phone's More sheet", as: superAdmin, only: "phone" },
  { name: "console-onboard", screen: "Onboard an agency, the form", as: superAdmin },
  { name: "console-onboard-calendar", screen: "Onboard an agency, the DateField's calendar open", as: superAdmin },
  { name: "console-record-payment", screen: "Organization, the Record a payment dialog, filled in", as: superAdmin },
  {
    name: "console-organization",
    screen: "Organization: record, subscription with payments, profile, members",
    as: superAdmin,
  },
  { name: "console-change-plan", screen: "Organization, the Change plan dialog", as: superAdmin },
  { name: "console-impersonate", screen: "Organization, the Sign in as dialog", as: superAdmin },
  { name: "console-plans", screen: "Plans and policy", as: superAdmin },
  { name: "console-plan-dialog", screen: "Plans, the New plan dialog", as: superAdmin },
  { name: "console-policy-dialog", screen: "Plans, the Change the policy dialog", as: superAdmin },
  { name: "console-jobs", screen: "Jobs, a failed job and the schedules", as: superAdmin },
  { name: "console-log", screen: "The platform log, an entry opened", as: superAdmin },
  { name: "console-staff", screen: "Platform staff", as: superAdmin },
  { name: "console-staff-add", screen: "Platform staff, the Add dialog, filled in", as: superAdmin },
  { name: "console-staff-handover", screen: "Platform staff, the password handover", as: superAdmin },
  {
    name: "console-data-protection",
    screen: "Data protection: an export, the purge, the subject form",
    as: superAdmin,
  },
  { name: "console-dashboard-support", screen: "Console dashboard", as: support },
  { name: "console-organization-support", screen: "Organization, no super-admin actions", as: support },
  { name: "impersonating", screen: "Home while impersonating, the banner and Stop", as: `${support}, as Asha Sharma` },
  { name: "agency-empty", screen: "An empty list (Business files)", as: owner },
  { name: "agency-error", screen: "An error with Try again (Roles, its call refused)", as: owner },
  { name: "agency-skeleton", screen: "A skeleton (Staff, its call held)", as: owner },
  { name: "console-empty", screen: "An empty list (Jobs, a queue with no failures)", as: superAdmin },
  { name: "console-error", screen: "An error with Try again (Plans, its calls refused)", as: superAdmin },
  { name: "console-skeleton", screen: "A skeleton (the platform log, its call held)", as: superAdmin },
] as const satisfies readonly Shot[];

export type ShotName = (typeof SHOTS)[number]["name"];
