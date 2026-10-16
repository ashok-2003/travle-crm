"use client";

// The home screen. Business modules (leads, quotes, bookings) arrive in later steps; until then it points those who
// can set the organization up at what to do first: the Owner at the setup checklist until it is done (spec 7.1),
// everyone else (and the Owner afterwards) at the screens their role may use.
import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { HomeChecklist } from "@/business/setup/home-checklist";
import { PageTitle } from "@/components/page-title";
import { Item, ItemContent, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { useMe } from "@/session/me-context";
import type { NavigationItem } from "@/shell/navigation";
import { useNavigationItems } from "@/shell/use-navigation-items";

/** The destinations that set the organization up: not home, nor the audit log, which looks back. */
type SetUpItem = NavigationItem & { key: Exclude<NavigationItem["key"], "home" | "audit"> };

export default function HomePage() {
  const t = useTranslations("shell.home");
  const me = useMe();
  const setUp = useNavigationItems().filter((item): item is SetUpItem => item.key !== "home" && item.key !== "audit");
  const screens =
    setUp.length > 0 ? (
      <section className="flex flex-col gap-3">
        <p className="text-muted-foreground">{t("intro", { organization: me.organization.name })}</p>
        <ItemGroup>
          {setUp.map((item, index) => (
            <Fragment key={item.key}>
              {index > 0 && <ItemSeparator />}
              <div role="listitem">
                <Item size="sm" asChild>
                  <Link href={item.href}>
                    <ItemMedia variant="icon">
                      <item.icon aria-hidden="true" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{t(item.key)}</ItemTitle>
                    </ItemContent>
                    <ChevronRightIcon aria-hidden="true" className="size-4" />
                  </Link>
                </Item>
              </div>
            </Fragment>
          ))}
        </ItemGroup>
      </section>
    ) : (
      <p className="text-muted-foreground">{t("nothingToSetUp")}</p>
    );
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <PageTitle>{t("title", { name: me.user.name })}</PageTitle>
      {me.member.role.isOwner ? <HomeChecklist afterwards={screens} /> : screens}
    </div>
  );
}
