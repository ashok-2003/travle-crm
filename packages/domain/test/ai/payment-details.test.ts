// Payment identifiers are removed by their shape, before the documents are cut into lines or sent to any call.
import { createMemoryAiModel } from "@travel-crm/integrations/ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findTrips, saveAiSettings } from "../../src/ai/index.js";
import { redactPayment } from "../../src/ai/drafts/payment-details.js";
import { packageSources } from "../../src/ai/drafts/sources.js";
import { anAgency, createTestImports, memberOf, type TestImports } from "../imports/support/test-imports.js";

const REMOVED = "[payment details removed]";

describe("redactPayment", () => {
  it.each(["x@ptsbi", "x@kotak", "x@okhdfc", "sample@okaxis", "manali.holidays@ybl."])(
    "removes the UPI id %s",
    (id) => {
      expect(redactPayment(`Pay to ${id} today`)).toContain(REMOVED);
      expect(redactPayment(`Pay to ${id} today`)).not.toContain("@");
    },
  );

  it("keeps emails, whose domain has a dot", () => {
    for (const email of ["sales@icici.com", "info@agency.com", "ops@mail.agency.in"]) {
      expect(redactPayment(`Write to ${email}.`)).toBe(`Write to ${email}.`);
    }
  });

  it.each([
    "Acc No. 50100123456789",
    "AC No: 5010 0123 4567 89",
    "a/c 5010-0123-4567-89",
    "Account number: 50100123456789",
  ])("removes the account number in %s", (text) => {
    const out = redactPayment(`Bank ${text} Kotak`);
    expect(out).toContain(REMOVED);
    expect(out).not.toMatch(/\d{4}/);
    expect(out).toContain("Kotak");
  });

  it("keeps AC room rates, which are not account numbers", () => {
    for (const text of ["AC 4500 5500 6500 per night", "Non AC 4500 5500 6500", "AC 4500"])
      expect(redactPayment(text)).toBe(text);
    expect(redactPayment("AC 50100123456789")).toContain(REMOVED);
  });

  it("removes an IFSC in any case, and every long digit run on its line", () => {
    expect(redactPayment("ifsc hdfc0001234")).toBe(`ifsc ${REMOVED}`);
    const out = redactPayment("Beneficiary 50100123456789 IFSC HDFC0001234");
    expect(out).not.toMatch(/\d{9}/);
    expect(out).not.toContain("HDFC0001234");
    expect(redactPayment("Call 9876543210 now")).toBe("Call 9876543210 now");
  });

  it("removes pay links", () => {
    expect(redactPayment("Pay at https://rzp.io/l/abc or upi://pay?pa=x@ybl")).toBe(`Pay at ${REMOVED} or ${REMOVED}`);
  });
});

describe("payment identifiers in the sources", () => {
  let test: TestImports;
  beforeAll(() => {
    test = createTestImports();
  });
  afterAll(() => test.close());

  it("removes an identifier that the 400-character cut would have split, and the find-trips prompt holds none", async () => {
    const organizationId = await anAgency(test, "Payment agency");
    const owner = memberOf(organizationId, "org-owner");
    const upi = "manaliholidays@okhdfcbank";
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    await inOrg((tx) =>
      saveAiSettings(tx, owner, { enabled: true, scoring: true }, { providerReady: true, now: new Date() }),
    );
    // The id begins inside the first 400 characters and ends after them.
    const long = `Manali 5 Nights 6 Days ${"x".repeat(365)} pay ${upi} thanks`;
    await inOrg(async (tx) => {
      await tx.aiKnowledge.create({ data: { title: "Manali", body: long } });
      await tx.aiAutopilot.updateMany({ data: { strictRules: `Advance to UPI ${upi} only` } });
      await tx.aiSettings.updateMany({ data: { instructions: "Bank account no 50100123456789" } });
    });
    const pieces = await inOrg((tx) => packageSources(tx));
    const text = JSON.stringify(pieces);
    for (const secret of [upi, "manaliholidays", "okhdfc", "50100123456789"]) expect(text).not.toContain(secret);
    const model = createMemoryAiModel();
    model.answer(JSON.stringify({ trips: [{ name: "Manali", place: "Manali", nights: 5, lines: ["P1.L1"] }] }));
    await findTrips({ db: test.db, model }, owner, {}, new Date("2026-11-02T06:30:00Z"));
    const sent =
      model.requests
        .at(-1)
        ?.messages.map((message) => message.content)
        .join("\n") ?? "";
    expect(sent).toContain(REMOVED);
    expect(sent).not.toContain("okhdfc");
    expect(sent).not.toContain("50100123456789");
  });
});
