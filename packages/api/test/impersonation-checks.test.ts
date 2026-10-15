// Request check 1 for support's impersonation (spec 6.4): its session is read from the database on every request,
// never from the cookie cache, and its admin re-checked, so it stops the moment either is gone.
import { describe, expect, it } from "vitest";
import { adminUserId, callerFor, outcome } from "./request-probe.js";

describe("support's impersonation", () => {
  it("is read from the database on every request, while other sessions use the cookie cache", async () => {
    const plain = callerFor({});
    expect(await outcome(plain.caller.whoAmI())).toBe("nobody");
    expect(plain.reads.sessions).toBe(0);
    const impersonating = callerFor({ impersonatedBy: adminUserId });
    expect(await outcome(impersonating.caller.whoAmI())).toBe(adminUserId);
    expect(impersonating.reads.sessions).toBe(1);
  });

  it("stops at once when its session is gone, though the cookie cache still holds it", async () => {
    const ended = callerFor({ impersonatedBy: adminUserId, storedSession: null });
    expect(await outcome(ended.caller.whoAmI())).toBe("UNAUTHORIZED");
    expect(await outcome(ended.caller.view())).toBe("UNAUTHORIZED");
  });

  it("stops at once when the admin is no longer platform staff", async () => {
    const demoted = callerFor({ impersonatedBy: adminUserId, adminStillStaff: false });
    expect(await outcome(demoted.caller.whoAmI())).toBe("UNAUTHORIZED");
    expect(await outcome(demoted.caller.manageStaff())).toBe("UNAUTHORIZED");
  });
});
