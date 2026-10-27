"use client";

// The home screen (/dashboard). Whoever may change the organization's settings (the Owner, Admins) sees the setup card
// above everything else until the checklist is done (spec 7.1); right under it, whoever's role sees leads on a plan
// with them sees the day's nudge (spec 3.1: a count, three things, Open Today), never Today's long list; then the
// screens their role may use to set the organization up; between them, for a role that sees leads, the dashboard
// (release B). New lead is the header's action, an outline button, so Open Today stays the main one.
import { ChevronRightIcon, KanbanIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { SetupCard } from "@/business/setup/setup-card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemContent, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { NewLeadButton } from "@/leads/new-lead-button";
import { routes } from "@/lib/routes";
import { holds, useMe } from "@/session/me-context";
import type { NavigationItem } from "@/shell/navigation";
import { useNavigationItems } from "@/shell/use-navigation-items";
import { TodayNudge } from "@/today/today-nudge";
import { Dashboard } from "@/dashboard/dashboard";
import { HotLeadsCard } from "@/sales/hot-leads-card";

/** The destinations that set the organization up: not home, Today, Leads, the Inbox, Quotes or Finance (daily work), nor the audit log. */
type SetUpItem = NavigationItem & {
  key: Exclude<NavigationItem["key"], "home" | "today" | "leads" | "inbox" | "quotes" | "finance" | "audit">;
};

const notSetUp: readonly NavigationItem["key"][] = ["home", "today", "leads", "inbox", "quotes", "finance", "audit"];

export default function HomePage() {
  const t = useTranslations("shell.home");
  const me = useMe();
  const items = useNavigationItems();
  // Today and Leads show where the role sees leads, on a plan with them, and the subscription keeps them open.
  const showsToday = items.some((item) => item.key === "today");
  const addsLeads = items.some((item) => item.key === "leads") && holds(me, "leads:create");
  const setUp = items.filter((item): item is SetUpItem => !notSetUp.includes(item.key));
  const screens =
    setUp.length > 0 ? (
      <Card>
        <CardHeader>
          <CardTitle>{t("setUpTitle")}</CardTitle>
          <CardDescription>{t("intro")}</CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    ) : null;
  const managesSettings = holds(me, "settings:manage");
  const actions = addsLeads && (
    <div className="flex flex-wrap gap-2">
      <NewLeadButton variant="outline" />
      <Button asChild variant="outline">
        <Link href={routes.leadsPipeline}>
          <KanbanIcon aria-hidden="true" />
          {t("pipeline")}
        </Link>
      </Button>
    </div>
  );
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("title", { name: me.user.name })} intro={t("intro2")} action={actions} />
      <div className="grid gap-4 lg:grid-cols-2">
        {managesSettings && <SetupCard />}
        {showsToday && <TodayNudge />}
      </div>
      {showsToday && <HotLeadsCard />}
      {/* Where the role sees leads on a plan with them, as Today: the period's figures, at the content's full width. */}
      {showsToday && <Dashboard />}
      {screens}
      {screens === null && <p className="text-muted-foreground">{t("nothingToSetUp")}</p>}
    </div>
  );
}
