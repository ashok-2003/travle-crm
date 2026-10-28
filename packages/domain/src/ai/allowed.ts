// Whether an agency may use the AI at all: its plan has the AI module and its subscription is neither read-only, suspended nor cancelled (as the request path refuses them).
// The request checks do this for a person's call; the worker, which acts with no request, asks here before any AI call.
import type { Entitlements } from "../subscriptions/index.js";

export function aiAllowed(entitlements: Pick<Entitlements, "status" | "modules"> | null): boolean {
  return (
    entitlements !== null &&
    entitlements.status !== "read_only" &&
    entitlements.status !== "suspended" &&
    entitlements.status !== "cancelled" &&
    entitlements.modules.has("ai")
  );
}
