"use client";

// The Follow-ups screen (the owner, 2026-10-30): every open follow-up on a lead, due now (overdue and today) or later,
// the member's own or, for a manager, everyone's. Each row shows its lead, the lead's last WhatsApp message and whether
// the 24-hour window is open, and what the AI wrote when the follow-up came due; Done, Snooze and Edit close or move it.
import type { FollowUpsInput } from "@travel-crm/contracts/ai";
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
import { useMe, viewScope } from "@/session/me-context";
import { FollowUpItem } from "./follow-up-item";

const views = ["due", "upcoming", "all"] as const;

export function FollowUpsScreen() {
  const t = useTranslations("tasks.followUps");
  const tLeads = useTranslations("leads.list");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  const ownOnly = viewScope(useMe(), "leads:view") !== "all";
  const [view, setView] = useState<FollowUpsInput["view"]>("due");
  const [whose, setWhose] = useState<"mine" | "everyone">("mine");
  const board = useQuery(trpc.tasks.followUps.queryOptions({ view, mine: ownOnly || whose === "mine" }));

  const body = () => {
    if (board.data) {
      if (board.data.rows.length === 0) {
        return <EmptyState icon={AlarmClockIcon} message={t(`empty.${view}`)} />;
      }
      const { people } = board.data;
      return (
        <ItemGroup role="list" aria-label={t("title")}>
          {board.data.rows.map((row, index) => (
            <Fragment key={row.taskId}>
              {index > 0 && <ItemSeparator />}
              <FollowUpItem row={row} people={people} showOwner={!ownOnly && whose === "everyone"} />
            </Fragment>
          ))}
        </ItemGroup>
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
      <PageHeader title={t("title")} intro={t("intro")} />
      <div className="flex flex-wrap gap-3">
        <Tabs
          value={view}
          onValueChange={(chosen) => {
            setView(views.find((one) => one === chosen) ?? "due");
          }}
        >
          <TabsList aria-label={t("when")}>
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
            <TabsList aria-label={tLeads("whose")}>
              <TabsTrigger value="mine">{tLeads("mine")}</TabsTrigger>
              <TabsTrigger value="everyone">{tLeads("everyone")}</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>
      {body()}
    </div>
  );
}
