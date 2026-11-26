// quotes.verifyUpi: whoever manages settings says they scanned the agency's UPI QR, paid ₹1 and saw it arrive; it is a fresh
// procedure (money setting) that needs settings:manage, takes no input, names who verified, and a member without the
// permission is refused. Settings come back with the verifier's name.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anAgency, callerOf, createHarness, refusal, type Harness } from "./forms-support.js";

describe("quotes.verifyUpi", () => {
  let harness: Harness;
  beforeAll(() => {
    harness = createHarness();
  });
  afterAll(() => harness.close());

  const settings = {
    upiId: "sharma@bank",
    upiName: "Sharma Holidays",
    defaultTaxRateBasisPoints: 500 as const,
    defaultTerms: "",
    defaultMarkupBasisPoints: 0,
    minMarginBasisPoints: null,
    minMarginPerPersonPaise: null,
  };

  it("refuses a member without settings:manage, and any input the procedure does not take", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes"] });
    const plain = callerOf(harness, { organizationId, granted: ["quotes:edit"] });
    expect(await refusal(plain.caller.quotes.verifyUpi({}))).toBe("MISSING_PERMISSION");
    const manager = callerOf(harness, { organizationId });
    expect(await refusal(manager.caller.quotes.verifyUpi({ upiId: "x@y" } as never))).toBe("BAD_REQUEST");
  });

  it("says a UPI id is needed first", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes"] });
    const { caller } = callerOf(harness, { organizationId });
    expect(await refusal(caller.quotes.verifyUpi({}))).toBe("UPI_ID_MISSING");
  });

  it("records the verification, names who did it, and clears it when the UPI id changes", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes"] });
    const { caller } = callerOf(harness, { organizationId });
    await caller.quotes.saveSettings(settings);
    expect((await caller.quotes.settings()).upiVerifiedAt).toBeNull();
    const verified = await caller.quotes.verifyUpi({});
    expect(verified).toMatchObject({ upiVerifiedByName: "Asha Rao" });
    expect(verified.upiVerifiedAt).not.toBeNull();
    expect(await caller.quotes.settings()).toMatchObject({ upiVerifiedByName: "Asha Rao" });
    const changed = await caller.quotes.saveSettings({ ...settings, upiId: "sharma@other" });
    expect(changed).toMatchObject({ upiVerifiedAt: null, upiVerifiedBy: null, upiVerifiedByName: null });
  });
});
