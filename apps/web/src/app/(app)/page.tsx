"use client";

// The home screen. Whoever may change the organization's settings (the Owner, Admins) sees the setup card above
// everything else until the checklist is done (spec 7.1); right under it, whoever's role sees leads on a plan with them
// sees the day's nudge (spec 3.1: a count, three things, Open Today), never Today's long list; then the screens their
// role may use to set the organization up. New lead is the header's action, an outline button, so Open Today stays the
// main one.
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment, useId } from "react";
import { SetupCard } from "@/business/setup/setup-card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Item, ItemContent, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { routes } from "@/lib/routes";
import { holds, useMe } from "@/session/me-context";
import type { NavigationItem } from "@/shell/navigation";
import { useNavigationItems } from "@/shell/use-navigation-items";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { TodayNudge } from "@/today/today-nudge";

/** The destinations that set the organization up: not home, Today or Leads (daily work), nor the audit log. */
type SetUpItem = NavigationItem & { key: Exclude<NavigationItem["key"], "home" | "today" | "leads" | "audit"> };

const notSetUp: readonly NavigationItem["key"][] = ["home", "today", "leads", "audit"];

/** New lead: a link to the form, or, while the subscription refuses changes, off and saying why (ADR 0021). */
function NewLeadButton() {
  const t = useTranslations("today.nudge");
  const write = useWriteAccess();
  const hintId = useId();
  const words = (
    <>
      <PlusIcon aria-hidden="true" />
      {t("newLead")}
    </>
  );
  return (
    <div className="flex flex-col items-start gap-2">
      {write.allowed ? (
        <Button asChild variant="outline">
          <Link href={routes.newLead}>{words}</Link>
        </Button>
      ) : (
        <Button variant="outline" disabled aria-describedby={hintId}>
          {words}
        </Button>
      )}
      <WriteHint id={hintId} hint={write.hint} />
    </div>
  );
}

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
      <PageHeader title={t("title", { name: me.user.name })} action={addsLeads && <NewLeadButton />} />
      {holds(me, "settings:manage") && <SetupCard />}
      {showsToday && <TodayNudge />}
      {screens}
    </div>
  );
}
