"use client";

// The Follow-ups screen: the customers the member promised to get back to (a manager may see everyone's). Tabs Due
// (Overdue, Due today) and Later (Tomorrow, This week, Later); the header counts what is due and how many replied. Each
// row says its next move; Done asks when the next follow-up is, a dialog kept here because the row goes when it is done.
import type { FollowUpRow } from "@travel-crm/contracts/ai";
import { useQuery } from "@tanstack/react-query";
import { AlarmClockIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { ItemGroup, ItemSeparator } from "@/components/ui/item";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTRPC } from "@/data/trpc";
import { formatCount } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { useMe, viewScope } from "@/session/me-context";
import { FollowUpItem } from "./follow-up-item";
import { NextFollowUpDialog, type NextFollowUpTarget } from "./next-follow-up-dialog";
import { replied } from "./next-move";
import { followUpSections } from "./sections";

const views = ["due", "upcoming"] as const;
type View = (typeof views)[number];

export function FollowUpsScreen() {
  const t = useTranslations("tasks.followUps");
  const tLeads = useTranslations("leads.list");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  const now = useNow();
  const { timeZone } = useMe().organization;
  const ownOnly = viewScope(useMe(), "leads:view") !== "all";
  const [view, setView] = useState<View>("due");
  const [whose, setWhose] = useState<"mine" | "everyone">("mine");
  const [next, setNext] = useState<NextFollowUpTarget | null>(null);
  const mine = ownOnly || whose === "mine";
  // Both tabs' lists load, so the header can count what is due while the Later tab is open.
  const due = useQuery(trpc.tasks.followUps.queryOptions({ view: "due", mine }));
  const later = useQuery(trpc.tasks.followUps.queryOptions({ view: "upcoming", mine }));
  const board = view === "due" ? due : later;

  const askNext = (row: FollowUpRow) => {
    setNext({ leadId: row.lead.id, title: row.title, dueAt: row.dueAt });
  };

  const body = () => {
    if (board.data) {
      if (board.data.rows.length === 0) {
        return <EmptyState icon={AlarmClockIcon} message={t(`empty.${view}`)} />;
      }
      const { people } = board.data;
      return (
        <div className="flex flex-col gap-10">
          {followUpSections(view, board.data.rows, now, timeZone).map((section) => (
            <section key={section.group} aria-label={t(`groups.${section.group}`)} className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-section font-semibold">{t(`groups.${section.group}`)}</h2>
                <span className="numbers text-label text-muted-foreground">{formatCount(section.rows.length)}</span>
              </div>
              <ItemGroup role="list">
                {section.rows.map((row, index) => (
                  <Fragment key={row.taskId}>
                    {index > 0 && <ItemSeparator />}
                    <FollowUpItem
                      row={row}
                      people={people}
                      showOwner={!ownOnly && whose === "everyone"}
                      onDone={askNext}
                    />
                  </Fragment>
                ))}
              </ItemGroup>
            </section>
          ))}
        </div>
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
    return <LoadingRows rows={4} shape="twoLines" />;
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        intro={due.data && t("intro", { due: due.data.rows.length, replied: due.data.rows.filter(replied).length })}
      />
      <div className="flex flex-wrap gap-3">
        <Tabs
          value={view}
          onValueChange={(chosen) => {
            setView(views.find((one) => one === chosen) ?? "due");
          }}
        >
          <TabsList variant="solid" aria-label={t("when")}>
            {views.map((one) => (
              <TabsTrigger key={one} value={one}>
                {t(`views.${one}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {!ownOnly && (
          <Tabs
            value={whose}
            onValueChange={(chosen) => {
              setWhose(chosen === "everyone" ? "everyone" : "mine");
            }}
          >
            <TabsList variant="solid" aria-label={tLeads("whose")}>
              <TabsTrigger value="mine">{tLeads("mine")}</TabsTrigger>
              <TabsTrigger value="everyone">{tLeads("everyone")}</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>
      {body()}
      <NextFollowUpDialog
        target={next}
        onClose={() => {
          setNext(null);
        }}
      />
    </div>
  );
}
