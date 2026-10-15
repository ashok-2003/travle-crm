// @vitest-environment node
// What the shell says about the subscription (spec 7.3): the trial's last week, payment due with the day read-only
// begins, and read-only itself; nothing while all is well, nor for the states that shut the screens instead.
import type { LifecycleAccess, SubscriptionOverview, SubscriptionStatus } from "@travel-crm/contracts/subscriptions";
import { parseCalendarDate } from "@travel-crm/domain/kernel";
import { describe, expect, it } from "vitest";
import { noticeOf } from "@/subscription/subscription-notice";

const today = parseCalendarDate("2026-10-16");

const accessOf: Record<SubscriptionStatus, LifecycleAccess> = {
  trial: "full",
  active: "full",
  past_due: "full",
  read_only: "read_only",
  suspended: "export_only",
  cancelled: "locked",
};

function overview(
  status: SubscriptionStatus,
  dates: Partial<Pick<SubscriptionOverview, "trialEndsOn" | "paidThrough" | "nextChangeOn">> = {},
): SubscriptionOverview {
  return {
    status,
    access: accessOf[status],
    planName: "Growth",
    modules: [],
    trialEndsOn: null,
    paidThrough: null,
    nextChangeOn: null,
    limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1_000_000_000 },
    ...dates,
  };
}

describe("noticeOf", () => {
  it("says when the trial ends, in its last seven days only", () => {
    const endingIn = (trialEndsOn: string) => noticeOf(overview("trial", { trialEndsOn }), today);
    expect(endingIn("2026-10-22")).toEqual({ kind: "trialEnding", on: "2026-10-22" });
    expect(endingIn("2026-10-16")).toEqual({ kind: "trialEnding", on: "2026-10-16" });
    expect(endingIn("2026-10-23")).toBeNull();
  });

  it("says payment is due, and from which day the organization is read-only", () => {
    expect(noticeOf(overview("past_due", { paidThrough: "2026-10-14", nextChangeOn: "2026-10-22" }), today)).toEqual({
      kind: "pastDue",
      readOnlyFrom: "2026-10-22",
    });
  });

  it("says a read-only organization is so until it pays", () => {
    expect(noticeOf(overview("read_only", { nextChangeOn: "2026-10-30" }), today)).toEqual({ kind: "readOnly" });
  });

  it("says nothing of an active subscription, nor of those whose screens are shut", () => {
    expect(noticeOf(overview("active", { paidThrough: "2027-10-15", nextChangeOn: "2027-10-16" }), today)).toBeNull();
    expect(noticeOf(overview("suspended"), today)).toBeNull();
    expect(noticeOf(overview("cancelled"), today)).toBeNull();
  });
});
