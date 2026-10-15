"use client";

// Who is signed in to the console (whoAmI): their name and level, for every console screen. The console gate
// provides it once whoAmI has answered, so screens never see a missing person.
import type { PlatformWhoAmIOutput } from "@travel-crm/contracts/platform";
import { createContext, useContext, type ReactNode } from "react";

/** Platform staff as the console shows them: support, or a super admin, who also manages plans and staff. */
export type ConsoleStaff = PlatformWhoAmIOutput;

const StaffContext = createContext<ConsoleStaff | null>(null);

export function StaffProvider({ staff, children }: { staff: ConsoleStaff; children: ReactNode }) {
  return <StaffContext value={staff}>{children}</StaffContext>;
}

export function useStaff(): ConsoleStaff {
  const staff = useContext(StaffContext);
  if (!staff) throw new Error("useStaff() is for screens inside the console's gate");
  return staff;
}

/** For showing or hiding things only: the console's api refuses support what is a super admin's (spec 5). */
export function isSuperAdmin(staff: Pick<ConsoleStaff, "level">): boolean {
  return staff.level === "super-admin";
}
