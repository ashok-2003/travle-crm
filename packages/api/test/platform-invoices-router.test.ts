// The invoices router is for super admins only: platform support is refused every procedure, before any service runs.
import type { PlatformStaffMember } from "@travel-crm/domain/identity";
import { describe, expect, it } from "vitest";
import type { PlatformContext } from "../src/platform/context.js";
import { invoicesRouter } from "../src/platform/routers/invoices.js";
import { platformT } from "../src/platform/trpc.js";

const userId = "0199e7a0-0000-7000-8000-0000000000d1";
const invoiceId = "0199e7a0-0000-7000-8000-0000000000d2";

function callerFor(level: PlatformStaffMember["level"]) {
  const staff = { userId, name: "Platform person", level, twoFactorEnabled: true, mustChangePassword: false };
  const ctx = {
    services: { identity: { describePlatformStaff: () => Promise.resolve(staff) } },
    headers: new Headers(),
    resHeaders: new Headers(),
    session: { userId, impersonatedBy: null },
    user: { id: userId },
  } as unknown as PlatformContext;
  return platformT.createCallerFactory(invoicesRouter)(ctx);
}

/** The reason a call is refused with. */
async function refusal(call: Promise<unknown>): Promise<string | undefined> {
  try {
    await call;
  } catch (error) {
    return (error as { cause?: { reason?: string } }).cause?.reason;
  }
  return undefined;
}

describe("the invoices router", () => {
  it("refuses platform support every procedure", async () => {
    const caller = callerFor("support");
    const calls = [
      caller.billingDetails(),
      caller.setBillingDetails({
        legalName: "Test Firm",
        address: "1 Test Street",
        stateCode: "29",
        proformaPrefix: "PI",
        invoicePrefix: "INV",
      }),
      caller.list({ limit: 10 }),
      caller.get({ invoiceId }),
      caller.create({
        kind: "proforma",
        issuedOn: "2026-11-26",
        billTo: { name: "Acme Holidays" },
        lines: [{ description: "Starter plan", amountPaise: 100 }],
        gstRateBasisPoints: 0,
      }),
      caller.cancel({ invoiceId, reason: "Test" }),
      caller.downloadLink({ invoiceId }),
    ];
    for (const call of calls) expect(await refusal(call)).toBe("SUPER_ADMIN_ONLY");
  });
});
