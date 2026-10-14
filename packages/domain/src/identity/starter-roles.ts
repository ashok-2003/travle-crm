// The five roles every new organization starts with (spec 6.5). Owners can edit all but Owner, and add more.
// These defaults are recorded in docs/adr/0005-roles-and-permissions.md for the product owner to review.
import { PermissionSet, type Grant } from "./permission-set.js";
import type { ScopedPermission, UnscopedPermission } from "./permissions.js";

export interface StarterRole {
  key: string;
  name: string;
  isOwner: boolean;
  grants: readonly Grant[];
}

/** The Owner role's key. Keys never use Better Auth's built-in role names (owner, admin, member). */
export const OWNER_ROLE_KEY = "org-owner";

const allRecords = (permission: ScopedPermission): Grant => ({ permission, scope: "all" });
const ownRecords = (permission: ScopedPermission): Grant => ({ permission, scope: "own" });
const allow = (permission: UnscopedPermission): Grant => ({ permission, scope: null });

export const starterRoles: readonly StarterRole[] = [
  // Holds every permission, including ones added to the catalog later; it has no stored grants.
  { key: OWNER_ROLE_KEY, name: "Owner", isOwner: true, grants: [] },
  {
    // Runs the agency day to day: everything except changing roles and permissions.
    key: "org-admin",
    name: "Admin",
    isOwner: false,
    grants: PermissionSet.everything()
      .toGrants()
      .filter((grant) => grant.permission !== "roles:manage"),
  },
  {
    // Works their own leads through to bookings. No margins, no staff or settings.
    key: "sales",
    name: "Sales",
    isOwner: false,
    grants: [
      ownRecords("leads:view"),
      allow("leads:create"),
      allow("leads:edit"),
      ownRecords("quotes:view"),
      allow("quotes:create"),
      allow("quotes:edit"),
      ownRecords("bookings:view"),
      allow("bookings:create"),
      allow("departures:view"),
      allow("suppliers:view"),
    ],
  },
  {
    // Delivers confirmed trips: every booking, departures and suppliers. No leads, no margins.
    key: "operations",
    name: "Operations",
    isOwner: false,
    grants: [
      allRecords("quotes:view"),
      allRecords("bookings:view"),
      allow("bookings:edit"),
      allow("departures:view"),
      allow("departures:create"),
      allow("departures:edit"),
      allow("suppliers:view"),
      allow("suppliers:create"),
      allow("suppliers:edit"),
    ],
  },
  {
    // Invoices, receipts and supplier payments, so they see costs and margins.
    key: "accounts",
    name: "Accounts",
    isOwner: false,
    grants: [
      allow("accounts:view"),
      allow("accounts:create"),
      allow("accounts:edit"),
      allow("money:view_margin"),
      allRecords("quotes:view"),
      allRecords("bookings:view"),
      allow("suppliers:view"),
    ],
  },
];
