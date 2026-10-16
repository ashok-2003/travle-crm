"use client";

// Banners above every screen: offline (DESIGN.md: persistent while it lasts), support impersonating the member
// (spec 6.1: impersonation always shows a banner), with the way back to the console, and the subscription's state
// when it needs saying (spec 7.3: the trial's last week, payment due, read-only).
import { HeadsetIcon, WifiOffIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
        // To the person reading it, who is support: whose app this is, and that it is all recorded.
        <div className="px-4 pt-3 sm:px-6 lg:px-8">
          <Alert>
            <HeadsetIcon aria-hidden="true" />
            <AlertDescription className="flex flex-col items-start gap-2">
              {t("impersonated", { name: me.user.name, organization: me.organization.name })}
              <StopImpersonatingButton />
            </AlertDescription>
          </Alert>
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
