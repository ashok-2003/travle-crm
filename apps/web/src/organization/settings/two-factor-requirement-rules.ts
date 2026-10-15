// Who may flip the two-factor requirement (spec 6.2): anyone with settings:manage may require it, only an Owner may
// stop requiring it. The api enforces this; the switch only says so up front.

export function requirementSwitch({ required, isOwner }: { required: boolean; isOwner: boolean }): {
  disabled: boolean;
  /** A message key in "settings.security", or null. */
  reason: "ownerOnly" | null;
} {
  return required && !isOwner ? { disabled: true, reason: "ownerOnly" } : { disabled: false, reason: null };
}
