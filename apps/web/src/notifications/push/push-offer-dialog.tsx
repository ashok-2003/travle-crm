"use client";

// The pop-up that asks to turn push on (the owner, 2026-11-17), in the agency app and, for super admins, the console:
// "Please turn on notifications for the best experience". Whether to show it is push-offer.ts's rule, decided once
// once per page load, as soon as this device's push state is settled (the hook waits for the service worker). Turn on runs
// inside the tap, so Safari and iOS still ask permission; Not now closes it, and it comes back tomorrow or after the
// next sign-in. It is never shown where push can't work, or is already on.
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { PushApi } from "./push-api";
import type { PushState } from "./push-device";
import { consumeSignedIn, localDay, markOffered, shouldOfferPush, wasOfferedOn } from "./push-offer";
import { usePushOnThisDevice } from "./use-push-on-this-device";

export function PushOfferDialog({ api, platform = false }: { api: PushApi; platform?: boolean }) {
  const t = useTranslations("notifications.push.offer");
  const [open, setOpen] = useState(false);
  const decide = useCallback((state: PushState) => {
    const today = localDay();
    if (!shouldOfferPush({ state, justSignedIn: consumeSignedIn(), offeredOn: wasOfferedOn(), today })) return;
    markOffered(today);
    setOpen(true);
  }, []);
  const push = usePushOnThisDevice(api, decide);
  const { state } = push;

  const blocked = state === "blocked";
  async function turnOn() {
    const turned = await push.turnOn();
    if (turned === "on") {
      setOpen(false);
      toast.success(t("turnedOn"));
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      busy={push.busy}
      title={t(platform ? "platformTitle" : "title")}
      description={t(platform ? "platformDescription" : "description")}
      cancel={false}
      footer={
        <>
          <Button
            variant="outline"
            disabled={push.busy}
            onClick={() => {
              setOpen(false);
            }}
          >
            {t("notNow")}
          </Button>
          {!blocked && (
            <Button disabled={push.busy} onClick={() => void turnOn()}>
              {push.busy && <Spinner />}
              {push.busy ? t("turningOn") : t("turnOn")}
            </Button>
          )}
        </>
      }
    >
      <p className="text-muted-foreground">{blocked ? t("blocked") : t(platform ? "platformReasons" : "reasons")}</p>
    </ResponsiveDialog>
  );
}
