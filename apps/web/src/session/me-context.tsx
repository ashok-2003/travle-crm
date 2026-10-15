"use client";

// Who is signed in, for every screen inside the app shell: their organization, role and permissions (me.get). The
// session gate provides it once me.get has answered, so screens never see a missing member.
import type { MeOutput } from "@travel-crm/contracts/identity";
import { createContext, useContext, type ReactNode } from "react";

/** me.get's answer for a member: a member and organization are certain here. */
export type SignedInMember = MeOutput & {
  member: NonNullable<MeOutput["member"]>;
  organization: NonNullable<MeOutput["organization"]>;
};

const MeContext = createContext<SignedInMember | null>(null);

export function MeProvider({ me, children }: { me: SignedInMember; children: ReactNode }) {
  return <MeContext value={me}>{children}</MeContext>;
}

export function useMe(): SignedInMember {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe() is for screens inside the app shell's session gate");
  return me;
}

/**
 * Whether the member's role holds a permission, e.g. "staff:manage". For showing or hiding things only: the api
 * checks every call itself (spec 6.5).
 */
export function holds(me: SignedInMember, permission: string): boolean {
  return me.member.role.isOwner || me.member.permissions.some((grant) => grant.permission === permission);
}

export function useHolds(permission: string): boolean {
  return holds(useMe(), permission);
}

/** Narrows me.get's answer to a member of an organization. */
export function isSignedInMember(me: MeOutput): me is SignedInMember {
  return me.member !== null && me.organization !== null;
}
