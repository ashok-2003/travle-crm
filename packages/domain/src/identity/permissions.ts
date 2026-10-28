// The permission catalog (spec 6.5): everything a role can allow, as "module:action".
// Add permissions here as modules arrive. The Owner role holds new ones automatically; other roles must be given them.

/** View permissions carry a scope: the member's own records, or all of them (spec 6.5). */
const scopedPermissions = ["leads:view", "quotes:view", "bookings:view", "inbox:view"] as const;

export const permissions = [
  // Foundation
  "staff:manage",
  "roles:manage",
  "settings:manage",
  "audit:view",
  "money:view_margin",
  // The sales and collections reports: what the agency earned and was paid
  "money:view_reports",
  // Traveller ID documents such as passports and Aadhaar (spec 5): files marked sensitive
  "documents:view_sensitive",
  // Business modules, listed now so the starter roles are complete from the first organization
  ...scopedPermissions,
  "leads:create",
  "leads:edit",
  // Reassign a lead, choose its owner in the form, give a task to someone else, and block or unblock a contact
  "leads:assign",
  // WhatsApp chats (own: the chats of people whose leads the member sees), replying, and the message templates
  "inbox:reply",
  "inbox:templates",
  "quotes:create",
  "quotes:edit",
  // Record and void the money a customer paid on a quote, and issue its invoice and receipts
  "quotes:record_payments",
  "bookings:create",
  "bookings:edit",
  "departures:view",
  "departures:create",
  "departures:edit",
  "suppliers:view",
  "suppliers:create",
  "suppliers:edit",
  "accounts:view",
  "accounts:create",
  "accounts:edit",
] as const;

export type Permission = (typeof permissions)[number];
export type ScopedPermission = (typeof scopedPermissions)[number];
export type UnscopedPermission = Exclude<Permission, ScopedPermission>;

const catalog: ReadonlySet<string> = new Set(permissions);
const scoped: ReadonlySet<string> = new Set(scopedPermissions);

export function isPermission(value: string): value is Permission {
  return catalog.has(value);
}

export function isScopedPermission(permission: Permission): permission is ScopedPermission {
  return scoped.has(permission);
}

/** The module a permission belongs to: "leads:create" → "leads". Plan entitlements (spec 7.2) are per module. */
export function moduleOf(permission: Permission): string {
  return permission.slice(0, permission.indexOf(":"));
}

/** The catalog as the roles editor shows it. */
export const permissionCatalog = permissions.map((permission) => ({
  permission,
  module: moduleOf(permission),
  scoped: isScopedPermission(permission),
}));
