"use client";

// Home's first row (sales execution): the day at a glance, each figure a way straight to the work: new leads to answer,
// chats waiting for a reply (the late ones called out), follow-ups due today, work overdue, hot leads to call, and
// money due from customers (only for whoever holds the money permission). A figure the member's role or plan doesn't have is left out.
import type { LucideIcon } from "lucide-react";
import {
  AlarmClockIcon,
  CalendarClockIcon,
  FlameIcon,
  IndianRupeeIcon,
  MessageCircleIcon,
  UserPlusIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { rupees } from "@/components/forms/money-field";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { useTRPC } from "@/data/trpc";
import { useInboxSummary } from "@/inbox/use-sales-inbox";
import { formatCount } from "@/lib/format";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useHotLeads } from "@/sales/use-sales";
import { useTodaySummary } from "@/today/use-today";

interface Tile {
  key: string;
  icon: LucideIcon;
  value: string;
  label: string;
  note: string;
  href: string;
  urgent: boolean;
}

function TileLink({ tile }: { tile: Tile }) {
  return (
    <Item asChild variant="outline" className="bg-card">
      <Link href={tile.href}>
        <ItemMedia variant="icon" className={cn(tile.urgent && "text-status-bad-ink")}>
          <tile.icon aria-hidden="true" />
        </ItemMedia>
        <ItemContent>
          <ItemDescription>{tile.label}</ItemDescription>
          <ItemTitle className={cn("numbers text-section", tile.urgent && "text-status-bad-ink")}>
            {tile.value}
          </ItemTitle>
          <ItemDescription className="text-caption">{tile.note}</ItemDescription>
        </ItemContent>
      </Link>
    </Item>
  );
}

function MoneyDueTile({ today }: { today: string }) {
  const t = useTranslations("home.glance");
  const trpc = useTRPC();
  const money = useQuery(trpc.quotes.moneySummary.queryOptions({ from: `${today.slice(0, 8)}01`, to: today }));
  if (money.data === undefined) return null;
  return (
    <TileLink
      tile={{
        key: "money",
        icon: IndianRupeeIcon,
        value: rupees(money.data.outstandingPaise),
        label: t("money"),
        note:
          money.data.overdueCount > 0
            ? t("moneyLate", { count: money.data.overdueCount, amount: rupees(money.data.overduePaise) })
            : t("moneyNote"),
        href: routes.quotes,
        urgent: money.data.overdueCount > 0,
      }}
    />
  );
}

export function AtAGlance({ inbox, money }: { inbox: boolean; money: boolean }) {
  const t = useTranslations("home.glance");
  const today = useTodaySummary().data;
  const chats = useInboxSummary();
  const hot = useHotLeads().data;
  const counts = today?.counts;
  const tiles: Tile[] = [
    {
      key: "new",
      icon: UserPlusIcon,
      value: formatCount(counts?.newLeads ?? 0),
      label: t("newLeads"),
      note: t("newLeadsNote"),
      href: routes.today,
      urgent: (counts?.newLeads ?? 0) > 0,
    },
    ...(inbox
      ? [
          {
            key: "waiting",
            icon: MessageCircleIcon,
            value: formatCount(chats.data?.waiting ?? 0),
            label: t("waiting"),
            note: (chats.data?.late ?? 0) > 0 ? t("late", { count: chats.data?.late ?? 0 }) : t("waitingNote"),
            href: routes.inbox,
            urgent: (chats.data?.late ?? 0) > 0,
          },
        ]
      : []),
    {
      key: "due",
      icon: CalendarClockIcon,
      value: formatCount(counts?.dueToday ?? 0),
      label: t("dueToday"),
      note: t("dueTodayNote"),
      href: routes.today,
      urgent: false,
    },
    {
      key: "overdue",
      icon: AlarmClockIcon,
      value: formatCount(counts?.overdue ?? 0),
      label: t("overdue"),
      note: (counts?.overdue ?? 0) > 0 ? t("overdueNote") : t("nothingLate"),
      href: routes.today,
      urgent: (counts?.overdue ?? 0) > 0,
    },
    {
      key: "hot",
      icon: FlameIcon,
      value: formatCount(hot?.length ?? 0),
      label: t("hot"),
      note: t("hotNote"),
      href: routes.today,
      urgent: (hot?.length ?? 0) > 0,
    },
  ];
  return (
    <section aria-labelledby="glance-heading" className="flex flex-col gap-3">
      <h2 id="glance-heading" className="text-section font-semibold">
        {t("title")}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {tiles.map((tile) => (
          <TileLink key={tile.key} tile={tile} />
        ))}
        {money && today !== undefined && <MoneyDueTile today={today.day} />}
      </div>
    </section>
  );
}
