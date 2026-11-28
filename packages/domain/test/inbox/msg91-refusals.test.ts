// MSG91 refusing a send of ours for its own reason (its balance, a blocked country) is the platform's to fix, so it tells
// the console as an incident (the owner, 2026-11-28); the agency's inbox is left as it is. WhatsApp's per-customer codes
// ("131026: ...") and the phone app's reports (no request id) are not the platform's.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  aConnectedAgency,
  createTestInbox,
  deliver,
  freshPhone,
  statusFor,
  testNow,
  type TestInbox,
} from "./support.js";

// Ten minutes old: a report for a message we don't have is dropped, not tried again.
const ts = Math.floor(testNow.getTime() / 1000) - 600;

describe("MSG91 refusing our sends", () => {
  let test: TestInbox;
  const reports: { kind: string; detail: string }[] = [];
  beforeAll(() => {
    test = createTestInbox();
    test.dependencies.incidents = {
      report: (kind, detail) => {
        reports.push({ kind, detail });
      },
    };
  });
  beforeEach(() => {
    reports.length = 0;
  });
  afterAll(() => test.close());

  async function report(eventName: "sent" | "delivered" | "read" | "failed", more: Record<string, string>) {
    const connection = await aConnectedAgency(test);
    const customerNumber = freshPhone().replace("+", "");
    const wamid = `wamid.OUT-${customerNumber}`;
    await deliver(test, { ...statusFor(connection, { customerNumber, wamid, eventName, ts }), ...more });
  }

  it("tells the console MSG91's reason when it refuses a send of ours (live, 27 Nov: insufficient balance)", async () => {
    await report("failed", { requestId: "req-1", reason: "insufficient balance" });
    await report("failed", { requestId: "req-2", reason: "Outbound restricted due to blocked prefixes (968)" });
    expect(reports).toEqual([
      { kind: "whatsapp.refused", detail: "insufficient balance" },
      { kind: "whatsapp.refused", detail: "Outbound restricted due to blocked prefixes (968)" },
    ]);
  });

  it("says nothing of WhatsApp's per-customer codes, the phone app's reports, or a send that went", async () => {
    await report("failed", { requestId: "req-3", reason: "131026: Message undeliverable" });
    await report("failed", { reason: "insufficient balance" });
    await report("delivered", { requestId: "req-4" });
    expect(reports).toEqual([]);
  });
});
