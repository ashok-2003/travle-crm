// The agency's UPI QR is verified by a person who scanned it and paid ₹1: who, when and which UPI id are kept and audited;
// changing the UPI id clears it (audited); only the current UPI id counts as verified.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { quoteSettingsOf, saveQuoteSettings, verifyUpi } from "../../src/quotes/index.js";
import { openWorld, type World } from "../bookings/support.js";

const rest = {
  upiName: "Sharma Holidays",
  defaultTaxRateBasisPoints: 500,
  defaultTerms: "",
  defaultMarkupBasisPoints: 0,
  minMarginBasisPoints: null,
  minMarginPerPersonPaise: null,
} as const;
const now = new Date("2026-11-27T10:10:00Z");

describe("verifying the UPI QR", () => {
  let world: World;
  beforeAll(async () => {
    world = await openWorld("UPI verify");
  });
  afterAll(async () => {
    await world.close();
  });
  const save = (upiId: string) => world.inOrg((tx) => saveQuoteSettings(tx, world.manager, { ...rest, upiId }));
  const audit = (action: string) => world.inOrg((tx) => tx.auditEntry.findMany({ where: { action } }));

  it("starts unverified, even with a UPI id", async () => {
    await save("sharma@bank");
    expect(await world.inOrg((tx) => quoteSettingsOf(tx))).toMatchObject({
      upiId: "sharma@bank",
      upiVerifiedAt: null,
      upiVerifiedBy: null,
    });
  });

  it("records who, when and which UPI id, and audits it", async () => {
    const settings = await world.inOrg((tx) => verifyUpi(tx, world.manager, now));
    expect(settings).toMatchObject({ upiVerifiedAt: now.toISOString(), upiVerifiedBy: world.manager.userId });
    const stored = await world.inOrg((tx) => tx.quoteSettings.findFirstOrThrow());
    expect(stored.upiVerifiedUpiId).toBe("sharma@bank");
    const entries = await audit("quote-settings.upi-verified");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ actorUserId: world.manager.userId, entityType: "quote_settings" });
    expect(entries[0]?.after).toMatchObject({ upiId: "sharma@bank" });
  });

  it("verifying again changes nothing and audits nothing more", async () => {
    await world.inOrg((tx) => verifyUpi(tx, world.accounts, new Date("2026-11-28T10:00:00Z")));
    expect((await world.inOrg((tx) => quoteSettingsOf(tx))).upiVerifiedBy).toBe(world.manager.userId);
    expect(await audit("quote-settings.upi-verified")).toHaveLength(1);
  });

  it("saving other settings keeps it, and changing the UPI id clears it with an audit entry", async () => {
    await world.inOrg((tx) =>
      saveQuoteSettings(tx, world.manager, { ...rest, upiName: "Sharma", upiId: "sharma@bank" }),
    );
    expect((await world.inOrg((tx) => quoteSettingsOf(tx))).upiVerifiedAt).not.toBeNull();
    expect(await audit("quote-settings.upi-verification-cleared")).toHaveLength(0);
    await save("sharma@other");
    expect(await world.inOrg((tx) => quoteSettingsOf(tx))).toMatchObject({ upiVerifiedAt: null, upiVerifiedBy: null });
    const stored = await world.inOrg((tx) => tx.quoteSettings.findFirstOrThrow());
    expect(stored.upiVerifiedUpiId).toBeNull();
    expect(await audit("quote-settings.upi-verification-cleared")).toHaveLength(1);
  });

  it("is refused with no UPI id", async () => {
    await save("");
    await expect(world.inOrg((tx) => verifyUpi(tx, world.manager, now))).rejects.toMatchObject({
      reason: "UPI_ID_MISSING",
    });
  });
});
