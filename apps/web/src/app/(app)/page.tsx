"use client";

// The home screen. Business modules (leads, quotes, bookings) arrive in later steps; until then it points those who
// can set the organization up at what to do first: whoever may change its settings (the Owner, Admins) sees the setup
// card above everything else until the checklist is done (spec 7.1), and everyone the screens their role may use.
import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { SetupCard } from "@/business/setup/setup-card";
import { PageHeader } from "@/components/page-header";
import { Item, ItemContent, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { holds, useMe } from "@/session/me-context";
import type { NavigationItem } from "@/shell/navigation";
import { useNavigationItems } from "@/shell/use-navigation-items";

/** The destinations that set the organization up: not home, Today or Leads (daily work), nor the audit log. */
type SetUpItem = NavigationItem & { key: Exclude<NavigationItem["key"], "home" | "today" | "leads" | "audit"> };

const notSetUp: readonly NavigationItem["key"][] = ["home", "today", "leads", "audit"];

export default function HomePage() {
  const t = useTranslations("shell.home");
  const me = useMe();
  const setUp = useNavigationItems().filter((item): item is SetUpItem => !notSetUp.includes(item.key));
  const screens =
    setUp.length > 0 ? (
      <section className="flex flex-col gap-3">
        <p className="text-muted-foreground">{t("intro")}</p>
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
      <PageHeader title={t("title", { name: me.user.name })} />
      {holds(me, "settings:manage") && <SetupCard />}
      {screens}
    </div>
  );
}
