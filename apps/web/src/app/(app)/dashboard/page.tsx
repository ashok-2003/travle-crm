"use client";

// The home screen (/dashboard), made to be read at a glance (sales execution): a greeting with the day, then, for a role
// that sees leads on a plan with them, the day at a glance (each figure a way to its work), the hot leads to call and the
// day's nudge (spec 3.1: a count, three things, Open Today) beside the month so far (the full figures are on Reports);
// then the setup card until the checklist is done (spec 7.1) and the screens the role may use to set the agency up.
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
import { AtAGlance } from "@/home/at-a-glance";
import { MonthCard } from "@/home/month-card";
import { HotLeadsCard } from "@/sales/hot-leads-card";

/** The destinations that set the organization up: not home, Today, Leads, Follow-ups, the Inbox, Quotes, Bookings or Finance (daily work), nor the audit log. */
type SetUpItem = NavigationItem & {
  key: Exclude<
    NavigationItem["key"],
    "home" | "today" | "leads" | "followUps" | "inbox" | "quotes" | "bookings" | "reports" | "finance" | "audit"
  >;
};

const notSetUp: readonly NavigationItem["key"][] = [
  "home",
  "today",
  "leads",
  "followUps",
  "inbox",
  "quotes",
  "bookings",
  "reports",
  "finance",
  "audit",
];

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
      <NewLeadButton />
      <Button asChild variant="outline">
        <Link href={routes.leadsPipeline}>
          <KanbanIcon aria-hidden="true" />
          {t("pipeline")}
        </Link>
      </Button>
    </div>
  );
  const has = (key: NavigationItem["key"]) => items.some((item) => item.key === key);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: me.organization.timeZone, hour: "2-digit", hourCycle: "h23" }).format(
      new Date(),
    ),
  );
  const partOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const today = new Intl.DateTimeFormat("en-IN", {
    timeZone: me.organization.timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  return (
    <div className="flex max-w-[1400px] flex-col gap-8">
      <PageHeader
        title={t("greeting", { part: partOfDay, name: me.user.name.split(/\s+/)[0] ?? me.user.name })}
        intro={t("todayIs", { day: today })}
        action={actions}
      />
      {/* Where the role sees leads on a plan with them: the day at a glance, what to do now, and the month so far. */}
      {showsToday && <AtAGlance inbox={has("inbox")} money={has("quotes") && holds(me, "money:view_reports")} />}
      {showsToday && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
          <div className="flex flex-col gap-6">
            <HotLeadsCard />
            <TodayNudge />
          </div>
          {has("reports") && <MonthCard />}
        </div>
      )}
      {managesSettings && <SetupCard />}
      {screens}
      {screens === null && !showsToday && <p className="text-muted-foreground">{t("nothingToSetUp")}</p>}
    </div>
  );
}
