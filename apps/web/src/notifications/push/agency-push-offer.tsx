"use client";

// The pop-up for the signed-in agency app. Support signed in as a member never sees it: the api refuses push for
// someone else's session, as it would reach support's device.
import { useMe } from "@/session/me-context";
import { PushOfferDialog } from "./push-offer-dialog";
import { useAgencyPushApi } from "./use-agency-push-api";

export function AgencyPushOffer() {
  const me = useMe();
  const api = useAgencyPushApi();
  if (me.impersonatedBy !== null) return null;
  return <PushOfferDialog api={api} />;
}
