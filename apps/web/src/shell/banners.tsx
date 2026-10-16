"use client";

// Banners above every screen: offline (DESIGN.md: persistent while it lasts), support impersonating the member
// (spec 6.1: impersonation always shows a banner), with the way back to the console, and the subscription's state
// when it needs saying (spec 7.3: the trial's last week, payment due, read-only).
import { HeadsetIcon, WifiOffIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMe } from "@/session/me-context";
import { SubscriptionBanner } from "@/subscription/subscription-banner";
import { StopImpersonatingButton } from "./stop-impersonating";
import { useOnline } from "./use-online";

export function Banners() {
  const t = useTranslations("shell.banners");
  const online = useOnline();
  const me = useMe();
  return (
    <>
      {me.impersonatedBy !== null && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-status-attention-fill px-4 py-2 text-label text-status-attention-ink">
          <HeadsetIcon aria-hidden="true" className="size-4 shrink-0" />
          <p className="flex-1">{t("impersonated")}</p>
          <StopImpersonatingButton />
        </div>
      )}
      <SubscriptionBanner />
      {!online && (
        <p role="status" className="flex items-center gap-2 bg-surface px-4 py-2 text-label text-foreground">
          <WifiOffIcon aria-hidden="true" className="size-4 shrink-0" />
          {t("offline")}
        </p>
      )}
    </>
  );
}
