// The console's procedure builders on stand-in services: staffProcedure lets in platform staff of either level with
// no temporary password and no impersonation, and superAdminProcedure super admins only. apps/api's console tests run
// the same checks on real sessions.
import type { PlatformStaffMember } from "@travel-crm/domain/identity";
import { describe, expect, it } from "vitest";
import type { PlatformContext } from "../src/platform/context.js";
import { staffProcedure, superAdminProcedure } from "../src/platform/procedures.js";
import { platformT } from "../src/platform/trpc.js";

const userId = "0199e7a0-0000-7000-8000-0000000000d1";

const probe = platformT.router({
  staffOnly: staffProcedure.query(({ ctx }) => ctx.staff.level),
  superAdminOnly: superAdminProcedure.query(() => "done"),
});

interface Setup {
  /** What describePlatformStaff answers for the session's user: null for anyone who isn't platform staff. */
  staff?: Partial<PlatformStaffMember> | null;
  /** Set on an impersonation session: the admin acting as the session's user. */
  impersonatedBy?: string | null;
}

function callerFor(setup: Setup) {
  const staff = setup.staff === null ? null : { userId, name: "Platform person", level: "support", ...setup.staff };
  const ctx = {
    services: { identity: { describePlatformStaff: () => Promise.resolve(staff) } },
    headers: new Headers(),
    resHeaders: new Headers(),
    session: { userId, impersonatedBy: setup.impersonatedBy ?? null },
    user: { id: userId },
  } as unknown as PlatformContext;
  return platformT.createCallerFactory(probe)(ctx);
}

/** The reason a call is refused with, or what it answered. */
async function outcome(call: Promise<string>): Promise<string> {
  try {
    return await call;
  } catch (error) {
    const cause = (error as { cause?: { reason?: string } }).cause;
    return cause?.reason ?? (error as { code: string }).code;
  }
}

describe("the console's procedures", () => {
  it("let in platform staff of either level", async () => {
    expect(await outcome(callerFor({}).staffOnly())).toBe("support");
    expect(await outcome(callerFor({ staff: { level: "super-admin" } }).staffOnly())).toBe("super-admin");
  });

  it("refuse anyone who isn't platform staff, or still has a temporary password", async () => {
    expect(await outcome(callerFor({ staff: null }).staffOnly())).toBe("PLATFORM_ONLY");
    expect(await outcome(callerFor({ staff: { mustChangePassword: true } }).staffOnly())).toBe("CHANGE_PASSWORD");
  });

  it("refuse an impersonation session by themselves, whoever its user is", async () => {
    // Better Auth refuses support impersonating other platform staff; the console doesn't rely on that alone.
    const impersonating = callerFor({
      staff: { level: "super-admin" },
      impersonatedBy: "0199e7a0-0000-7000-8000-0000000000d2",
    });
    expect(await outcome(impersonating.staffOnly())).toBe("PLATFORM_ONLY");
    expect(await outcome(impersonating.superAdminOnly())).toBe("PLATFORM_ONLY");
  });

  it("keep super admins' procedures from support", async () => {
    expect(await outcome(callerFor({}).superAdminOnly())).toBe("SUPER_ADMIN_ONLY");
    expect(await outcome(callerFor({ staff: { level: "super-admin" } }).superAdminOnly())).toBe("done");
    expect(
      await outcome(callerFor({ staff: { level: "super-admin", mustChangePassword: true } }).superAdminOnly()),
    ).toBe("CHANGE_PASSWORD");
  });
});
