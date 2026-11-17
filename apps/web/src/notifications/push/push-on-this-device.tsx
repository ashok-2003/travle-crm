"use client";

// Push on this device, on the agency's notification choices' page: the card, for the signed-in member.
import { useMe } from "@/session/me-context";
import { PushDeviceCard } from "./push-device-card";
import { useAgencyPushApi } from "./use-agency-push-api";

export function PushOnThisDevice() {
  const me = useMe();
  return (
    <PushDeviceCard api={useAgencyPushApi()} impersonatedName={me.impersonatedBy === null ? null : me.user.name} />
  );
}
