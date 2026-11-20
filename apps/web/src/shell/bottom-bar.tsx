"use client";

// The app's phone navigation (shell/phone-navigation.tsx): the member's destinations, and in More their account, with
// the organization and the person atop it.
import { UserIcon } from "@heroicons/react/24/outline";
import { UserIcon as UserIconSolid } from "@heroicons/react/24/solid";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { routes } from "@/lib/routes";
import { useMe } from "@/session/me-context";
import { isAtOrUnder, isCurrent } from "./navigation";
import { PhoneNavigation } from "./phone-navigation";
import { usePrefetchDestination } from "./prefetch";
import { useSignOut } from "./sign-out";
import { useNavigationItems } from "./use-navigation-items";

export function BottomBar() {
  const t = useTranslations("shell.navigation");
  const me = useMe();
  const pathname = usePathname();
  const prefetch = usePrefetchDestination();
  const signOut = useSignOut();
  const items = useNavigationItems();
  return (
    <PhoneNavigation
      label={t("label")}
      moreLabel={t("more")}
      destinations={items.map((item) => {
        const current = isCurrent(item, pathname);
        return {
          key: item.key,
          href: item.href,
          icon: current ? item.activeIcon : item.icon,
          label: t(item.key),
          current,
          prefetch: () => {
            prefetch(item.key);
          },
        };
      })}
      moreOnly={[
        {
          key: "account",
          href: routes.account,
          icon: isAtOrUnder(pathname, routes.account) ? UserIconSolid : UserIcon,
          label: t("account"),
          current: isAtOrUnder(pathname, routes.account),
        },
      ]}
      title={me.organization.name}
      description={me.user.name}
      signOut={{ label: t("signOut"), onClick: signOut }}
    />
  );
}
