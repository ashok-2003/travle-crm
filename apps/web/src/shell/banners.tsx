"use client";

// Banners above every screen: offline (DESIGN.md: persistent while it lasts), and support impersonating the member
// (spec 6.1: impersonation always shows a banner).
import { HeadsetIcon, WifiOffIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMe } from "@/session/me-context";
import { useOnline } from "./use-online";

export function Banners() {
  const t = useTranslations("shell.banners");
  const online = useOnline();
  const me = useMe();
  return (
    <>
      {me.impersonatedBy !== null && (
        <p className="flex items-center gap-2 bg-status-attention-fill px-4 py-2 text-label text-status-attention-ink">
          <HeadsetIcon aria-hidden="true" className="size-4 shrink-0" />
          {t("impersonated")}
        </p>
      )}
      {!online && (
        <p role="status" className="flex items-center gap-2 bg-surface px-4 py-2 text-label text-foreground">
          <WifiOffIcon aria-hidden="true" className="size-4 shrink-0" />
          {t("offline")}
        </p>
      )}
    </>
  );
}
