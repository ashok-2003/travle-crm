// A staff role as a badge (DESIGN.md "Role Badges"), so people are told apart by role at a glance: the role's name in
// dark ink on its tint, with no dot (a role is a kind of person, not a state). The Owner role is always plum; roles are
// the agency's own, so every other role takes one of seven tints picked by its stable key: the same role is the same
// colour on every screen and every load, and the four starter roles each get a different one (a test holds that).
import { cn } from "@/lib/utils";

/** The seven tints, in the order a key picks from. Written out in full so Tailwind finds every class. */
export const roleTints = [
  "bg-role-pink-fill text-role-pink-ink",
  "bg-role-iris-fill text-role-iris-ink",
  "bg-role-olive-fill text-role-olive-ink",
  "bg-role-cyan-fill text-role-cyan-ink",
  "bg-role-clay-fill text-role-clay-ink",
  "bg-role-lime-fill text-role-lime-ink",
  "bg-role-teal-fill text-role-teal-ink",
] as const;

const ownerTint = "bg-role-owner-fill text-role-owner-ink";

/** A role's tint: the Owner's plum, or the one its key's string hash (31 × hash + each character) picks. */
export function roleTint(role: { key: string; isOwner: boolean }): string {
  if (role.isOwner) return ownerTint;
  let hash = 0;
  for (const character of role.key) hash = (Math.imul(hash, 31) + (character.codePointAt(0) ?? 0)) | 0;
  return roleTints[(hash >>> 0) % roleTints.length] ?? roleTints[0];
}

export function RoleBadge({
  role,
  isOwner,
  className,
}: {
  role: { key: string; name: string };
  isOwner: boolean;
  /** Its size where it is a title (Roles' list), never its colours. */
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center rounded-badge px-2 text-caption font-medium wrap-anywhere script-leading",
        roleTint({ key: role.key, isOwner }),
        className,
      )}
    >
      {role.name}
    </span>
  );
}
