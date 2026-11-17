"use client";

// Whether the console has push keys: its api answers an empty public key when it has none, and then neither the pop-up
// nor the switch is shown, since there is nothing to subscribe to. Super admins only (the procedure refuses support).
import { useQuery } from "@tanstack/react-query";
import { useConsoleTRPC } from "../data/console-trpc";
import { isSuperAdmin, useStaff } from "../session/staff-context";

export function usePlatformPushSetUp(): boolean {
  const trpc = useConsoleTRPC();
  const superAdmin = isSuperAdmin(useStaff());
  const key = useQuery(trpc.push.publicKey.queryOptions(undefined, { enabled: superAdmin }));
  return superAdmin && key.data !== undefined && key.data !== "";
}
