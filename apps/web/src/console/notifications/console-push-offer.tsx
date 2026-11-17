"use client";

// The pop-up asking a super admin to turn on platform alerts for this device. Support gets no platform alerts (the
// console's push api is a super admin's), and a console without push keys has none to offer: neither is asked.
import { PushOfferDialog } from "@/notifications/push/push-offer-dialog";
import { usePlatformPushSetUp } from "./use-platform-push-set-up";
import { useConsolePushApi } from "./use-console-push-api";

export function ConsolePushOffer() {
  const setUp = usePlatformPushSetUp();
  const api = useConsolePushApi();
  if (!setUp) return null;
  return <PushOfferDialog api={api} platform />;
}
