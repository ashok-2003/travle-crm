// @vitest-environment node
// What the app shows as allowed is what the api will allow (ADR 0021, request check 2): writeAccessOf answers every
// lifecycle state, kind of call and role as assertLifecycleAllows does, read from the domain itself. Tests may read
// the domain (only src is kept to the api's types).
import type { LifecycleAccess, SubscriptionOverview } from "@travel-crm/contracts/subscriptions";
import { DomainError } from "@travel-crm/domain/kernel";
import { assertLifecycleAllows, type Entitlements } from "@travel-crm/domain/subscriptions";
import { describe, expect, it } from "vitest";
import { writeAccessOf, type WriteKind } from "@/subscription/write-access";

const states: LifecycleAccess[] = ["full", "read_only", "export_only", "locked"];
const kinds: WriteKind[] = ["change", "revoke", "export"];

function overview(access: LifecycleAccess): SubscriptionOverview {
  return {
    status: "active",
    access,
    planName: "Growth",
    modules: [],
    trialEndsOn: null,
    paidThrough: null,
    nextChangeOn: null,
    limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1_000_000_000 },
  };
}

/** What the api's check 2 answers: allowed, or the refusal's reason. */
function apiAnswer(access: LifecycleAccess, call: { kind: WriteKind; isOwner: boolean }): string | null {
  try {
    assertLifecycleAllows({ access } as Entitlements, call);
    return null;
  } catch (error) {
    if (error instanceof DomainError) return error.reason;
    throw error;
  }
}

describe("writeAccessOf", () => {
  const rows = states.flatMap((access) =>
    kinds.flatMap((kind) => [true, false].map((isOwner) => ({ access, kind, isOwner }))),
  );

  it.each(rows)("answers $access, $kind, Owner $isOwner as the api does", ({ access, kind, isOwner }) => {
    const reason = apiAnswer(access, { kind, isOwner });
    expect(writeAccessOf(overview(access), { kind, isOwner })).toEqual(
      reason === null ? { allowed: true, reason: null } : { allowed: false, reason },
    );
  });

  it("allows while the subscription isn't known: the api decides", () => {
    expect(writeAccessOf(undefined, { kind: "change", isOwner: false })).toEqual({ allowed: true, reason: null });
  });

  it("lets every Owner revoke access, read-only and suspended, but nobody once cancelled", () => {
    expect(writeAccessOf(overview("read_only"), { kind: "revoke", isOwner: false }).allowed).toBe(true);
    expect(writeAccessOf(overview("export_only"), { kind: "revoke", isOwner: true }).allowed).toBe(true);
    expect(writeAccessOf(overview("export_only"), { kind: "revoke", isOwner: false })).toEqual({
      allowed: false,
      reason: "ORGANIZATION_SUSPENDED",
    });
    expect(writeAccessOf(overview("locked"), { kind: "export", isOwner: true })).toEqual({
      allowed: false,
      reason: "ORGANIZATION_CANCELLED",
    });
  });
});
