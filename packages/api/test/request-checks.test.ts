// The request checks of spec 6.5 in the procedure builders, on stand-in identity and subscription services: 2 the
// organization's lifecycle state, 3 the module on the plan, 4 the role's permission, in that order; and what
// subscription.get answers. Support's impersonation: impersonation-checks.test.ts.
import { describe, expect, it } from "vitest";
import { callerFor, outcome } from "./request-probe.js";

describe("request check 2: the organization's lifecycle state", () => {
  it("lets a read-only organization view and export, and refuses its changes", async () => {
    const { caller } = callerFor({ status: "read_only" });
    expect(await outcome(caller.view())).toBe("viewed");
    expect(await outcome(caller.exportData())).toBe("exported");
    expect(await outcome(caller.change())).toBe("ORGANIZATION_READ_ONLY");
  });

  it("lets only the Owner export while suspended", async () => {
    expect(await outcome(callerFor({ status: "suspended", isOwner: true }).caller.exportData())).toBe("exported");
    expect(await outcome(callerFor({ status: "suspended", isOwner: true }).caller.view())).toBe(
      "ORGANIZATION_SUSPENDED",
    );
    expect(await outcome(callerFor({ status: "suspended" }).caller.exportData())).toBe("ORGANIZATION_SUSPENDED");
  });

  it("lets a read-only organization revoke access, and only the Owner while suspended", async () => {
    expect(await outcome(callerFor({ status: "read_only" }).caller.revokeAccess())).toBe("revoked");
    expect(await outcome(callerFor({ status: "suspended", isOwner: true }).caller.revokeAccess())).toBe("revoked");
    expect(await outcome(callerFor({ status: "suspended" }).caller.revokeAccess())).toBe("ORGANIZATION_SUSPENDED");
    expect(await outcome(callerFor({ status: "cancelled", isOwner: true }).caller.revokeAccess())).toBe(
      "ORGANIZATION_CANCELLED",
    );
  });

  it("refuses everything once cancelled, or without a subscription, except what every state allows", async () => {
    const cancelled = callerFor({ status: "cancelled", isOwner: true }).caller;
    expect(await outcome(cancelled.exportData())).toBe("ORGANIZATION_CANCELLED");
    expect(await outcome(cancelled.status())).toBe("status");
    expect(await outcome(callerFor({ status: "none" }).caller.view())).toBe("NO_SUBSCRIPTION");
  });

  it("comes before checks 3 and 4", async () => {
    // Read-only, the module not on the plan, and no permission: the lifecycle answers.
    expect(await outcome(callerFor({ status: "read_only" }).caller.createLead())).toBe("ORGANIZATION_READ_ONLY");
  });
});

describe("request check 3: the module on the plan", () => {
  it("refuses a permission whose module isn't on the plan, before checking the role", async () => {
    expect(await outcome(callerFor({ modules: [] }).caller.createLead())).toBe("MODULE_NOT_ON_PLAN");
    expect(await outcome(callerFor({ modules: ["crm"] }).caller.createLead())).toBe("MISSING_PERMISSION");
    expect(await outcome(callerFor({ modules: ["crm"], granted: ["leads:create"] }).caller.createLead())).toBe(
      "lead created",
    );
  });

  it("refuses a business module's procedure off the plan though it requires no permission", async () => {
    expect(await outcome(callerFor({ modules: ["crm"] }).caller.quoteTemplates())).toBe("MODULE_NOT_ON_PLAN");
    expect(await outcome(callerFor({ modules: ["quotes"] }).caller.quoteTemplates())).toBe("templates");
  });

  it("refuses every call to a procedure that declares no plan module, rather than skip the check", async () => {
    expect(await outcome(callerFor({ isOwner: true }).caller.undeclared())).toBe("INTERNAL_SERVER_ERROR");
  });

  it("needs no module for the Foundation's own permissions", async () => {
    expect(await outcome(callerFor({ modules: [], isOwner: true }).caller.manageStaff())).toBe("staff managed");
  });
});

describe("subscription.get", () => {
  it("answers in every state, and refuses an organization without a subscription as check 2 does", async () => {
    expect(
      await outcome(
        callerFor({ status: "cancelled" })
          .caller.subscription.get()
          .then((got) => got.status),
      ),
    ).toBe("cancelled");
    const refused = await callerFor({ status: "none" })
      .caller.subscription.get()
      .catch((error: unknown) => error as { code: string; cause?: { reason?: string } });
    expect(refused).toMatchObject({ code: "FORBIDDEN", cause: { reason: "NO_SUBSCRIPTION" } });
  });
});
