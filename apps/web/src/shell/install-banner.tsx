"use client";

// A thin bar at the top of the agency app, on a phone in a browser, saying the app works best installed (spec
// 2026-11-25-pwa-icon-splash-banner): Install on Android where Chrome offers it, else where to find the app on the home
// screen, or how to add it on an iPhone. × hides it for a week. Never in the installed app, on a computer or off the
// signed-in screens: it is mounted by the agency app's layout alone.
import { brand } from "@travel-crm/brand";
import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent } from "@/components/ui/item";
import { hideInstallBar, promptInstall, useInstallState } from "./use-install-state";

export function InstallBanner() {
  const t = useTranslations("shell.installBar");
  const state = useInstallState();
  if (state === "none") return null;
  const product = brand.productName;
  const line = { installable: t("installable", { product }), installed: t("installed", { product }), ios: t("ios") }[
    state
  ];
  return (
    <Item variant="muted" size="sm" className="gap-2 rounded-none py-0 pr-1">
      <ItemContent className="text-label">{line}</ItemContent>
      <ItemActions>
        {state === "installable" && (
          <Button size="sm" onClick={() => void promptInstall()}>
            {t("install")}
          </Button>
        )}
        <Button variant="ghost" size="icon" aria-label={t("hide")} onClick={hideInstallBar}>
          <XIcon aria-hidden="true" />
        </Button>
      </ItemActions>
    </Item>
  );
}
