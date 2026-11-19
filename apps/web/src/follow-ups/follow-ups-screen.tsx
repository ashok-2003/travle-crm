"use client";

// The Follow-ups screen: the customers the member promised to get back to (a manager may see everyone's). Tabs Due
// (overdue and today) and Later, each with its count, beside Mine / Everyone; the header counts what is due and how many
// replied. Each tab is one table in due order (web revamp part 2), the due time in its urgency's colour; Done asks when
// the next follow-up is, a dialog kept here because the row goes when it is done.
import type { FollowUpRow } from "@travel-crm/contracts/ai";
import { useQuery } from "@tanstack/react-query";
import { AlarmClockIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkTable } from "@/components/work-table";
import { useTRPC } from "@/data/trpc";
import { TabCount } from "@/components/tab-count";
import { useWideScreen } from "@/lib/use-wide-screen";
import { useMe, viewScope } from "@/session/me-context";
import { useFollowUpColumns } from "./follow-up-columns";
import { NextFollowUpDialog, type NextFollowUpTarget } from "./next-follow-up-dialog";
import { replied } from "./next-move";

const views = ["due", "upcoming"] as const;
type View = (typeof views)[number];

const byDue = (a: FollowUpRow, b: FollowUpRow) => Date.parse(a.dueAt) - Date.parse(b.dueAt);

// Due and Later each keep a panel, both mounted (both lists load, so the header and the tabs can count them) and the
// other hidden. Mine / Everyone filter the one list and have no panels of their own, so their aria-controls (which
// Radix points at a panel that is never there) is left off: axe rejects it.
export function FollowUpsScreen() {
  const t = useTranslations("tasks.followUps");
  const tLeads = useTranslations("leads.list");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  const wide = useWideScreen();
  const ownOnly = viewScope(useMe(), "leads:view") !== "all";
  const [view, setView] = useState<View>("due");
  const [whose, setWhose] = useState<"mine" | "everyone">("mine");
  const [next, setNext] = useState<NextFollowUpTarget | null>(null);
  const mine = ownOnly || whose === "mine";
  const lists = {
    due: useQuery(trpc.tasks.followUps.queryOptions({ view: "due", mine })),
    upcoming: useQuery(trpc.tasks.followUps.queryOptions({ view: "upcoming", mine })),
  };
  const table = useFollowUpColumns({
    showOwner: !mine,
    onDone: (row) => {
      setNext({ leadId: row.lead.id, title: row.title, dueAt: row.dueAt });
    },
  });
  const due = lists.due.data?.rows;

  const panel = (one: View) => {
    const board = lists[one];
    if (board.data) {
      if (board.data.rows.length === 0) {
        return <EmptyState icon={AlarmClockIcon} message={t(`empty.${one}`)} />;
      }
      return (
        <WorkTable
          label={t(`views.${one}`)}
          rows={[...board.data.rows].sort(byDue)}
          rowKey={(row) => row.taskId}
          {...table(board.data.people)}
          more={t("showMore")}
        />
      );
    }
    if (board.isError) {
      return (
        <ErrorState
          message={t("loadFailed")}
          error={board.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void board.refetch()}
        />
      );
    }
    return <LoadingRows rows={4} shape={wide ? "table" : "twoLines"} columns={mine ? 5 : 6} />;
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        intro={due && t("intro", { due: due.length, replied: due.filter(replied).length })}
      />
      <Tabs
        value={view}
        onValueChange={(chosen) => {
          setView(views.find((one) => one === chosen) ?? "due");
        }}
      >
        <div className="flex flex-wrap gap-3">
          <TabsList variant="solid" aria-label={t("when")}>
            {views.map((one) => {
              const count = lists[one].data?.rows.length;
              return (
                <TabsTrigger key={one} value={one}>
                  {t(`views.${one}`)} {count !== undefined && <TabCount count={count} />}
                </TabsTrigger>
              );
            })}
          </TabsList>
          {!ownOnly && (
            <Tabs
              value={whose}
              onValueChange={(chosen) => {
                setWhose(chosen === "everyone" ? "everyone" : "mine");
              }}
            >
              <TabsList variant="solid" aria-label={tLeads("whose")}>
                <TabsTrigger value="mine" aria-controls={undefined}>
                  {tLeads("mine")}
                </TabsTrigger>
                <TabsTrigger value="everyone" aria-controls={undefined}>
                  {tLeads("everyone")}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
        {views.map((one) => (
          <TabsContent key={one} value={one} forceMount hidden={one !== view}>
            {panel(one)}
          </TabsContent>
        ))}
      </Tabs>
      <NextFollowUpDialog
        target={next}
        onClose={() => {
          setNext(null);
        }}
      />
    </div>
  );
}
