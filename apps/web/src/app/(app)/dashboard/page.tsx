"use client";

// The home screen (/dashboard), made to be read at a glance (spec 5): a greeting with the day and the period filter,
// the setup line until the checklist is done, then the leads by stage, and the day under it: your tasks and what needs
// you, the hot leads to call and the departures leaving soon, then the AI's insights. A card the role or the plan can't show
// is left out.
import type { Period } from "@travel-crm/contracts/kernel";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { SetupCard } from "@/business/setup/setup-card";
import { PageHeader } from "@/components/page-header";
import { AiInsightsCard } from "@/home/ai-insights-card";
import { AttentionCard } from "@/home/attention-card";
import { DeparturesCard } from "@/home/departures-card";
import { greetingName } from "@/home/greeting-name";
import { LeadsCard } from "@/home/leads-card";
import { PeriodFilter } from "@/home/period-filter";
import { TasksCard } from "@/home/tasks-card";
import { HotLeadsCard } from "@/sales/hot-leads-card";
import { holds, useMe } from "@/session/me-context";
import type { NavigationItem } from "@/shell/navigation";
import { useNavigationItems } from "@/shell/use-navigation-items";

export default function HomePage() {
  const t = useTranslations("shell.home");
  const me = useMe();
  const items = useNavigationItems();
  // The period of the leads card and of the chats the AI answered: this month until the member chooses another.
  const [period, setPeriod] = useState<Period>("month");
  const has = (key: NavigationItem["key"]) => items.some((item) => item.key === key);
  const managesSettings = holds(me, "settings:manage");
  const day = [
    has("today") && <TasksCard key="tasks" />,
    (has("leads") || has("inbox")) && <AttentionCard key="attention" />,
    has("leads") && <HotLeadsCard key="hot" />,
    has("departures") && <DeparturesCard key="departures" />,
    has("aiAgent") && <AiInsightsCard key="ai" period={period} />,
  ].filter((card) => card !== false);
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
    <div className="flex max-w-[1400px] flex-col gap-6">
      <PageHeader
        title={t("greeting", { part: partOfDay, name: greetingName(me.user.name) })}
        intro={t("todayIs", { day: today })}
        action={<PeriodFilter value={period} onChange={setPeriod} />}
      />
      {managesSettings && <SetupCard />}
      {has("leads") && <LeadsCard period={period} />}
      {day.length > 0 && <div className="grid gap-6 lg:grid-cols-2">{day}</div>}
      {!managesSettings && !has("leads") && day.length === 0 && (
        <p className="text-muted-foreground">{t("nothingToSetUp")}</p>
      )}
    </div>
  );
}
