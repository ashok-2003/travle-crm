"use client";

// The console's phone navigation, the app's own (shell/phone-navigation.tsx): the destinations for the person's
// level, with who is signed in atop More.
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { PhoneNavigation } from "@/shell/phone-navigation";
import { useStaff } from "../session/staff-context";
import { isCurrentConsoleItem, visibleConsoleItems } from "./console-navigation";
import { useConsoleSignOut } from "./console-sign-out";
import { SignedInStaff } from "./signed-in-staff";

export function ConsoleBottomBar() {
  const t = useTranslations("console");
  const pathname = usePathname();
  const signOut = useConsoleSignOut();
  const staff = useStaff();
  return (
    <PhoneNavigation
      label={t("navigation.label")}
      moreLabel={t("navigation.more")}
      destinations={visibleConsoleItems(staff).map((item) => ({
        key: item.key,
        href: item.href,
        icon: item.icon,
        // "Home" in the bar, where "Dashboard" would run to the screen's edge.
        label: item.key === "home" ? t("navigation.homeShort") : t(`navigation.${item.key}`),
        current: isCurrentConsoleItem(item, pathname),
      }))}
      title={t("title")}
      description={<SignedInStaff />}
      signOut={{ label: t("navigation.signOut"), onClick: signOut }}
    />
  );
}
