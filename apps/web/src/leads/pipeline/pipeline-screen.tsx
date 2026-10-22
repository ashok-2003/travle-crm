"use client";

// The pipeline (release C): every open lead in its stage's column, and the leads Won, newest first, a page at a time;
// managers switch between their own and everyone's. A lead moves by dragging its card to another column or with its
// Move to menu; the move is the lead page's own (leads.moveStage), so its timeline, audit and notices are the same.
// On a phone the columns scroll sideways, a stage at a time.
import { isOpenStage, openLeadStages, type LeadListItem, type LeadStage } from "@travel-crm/contracts/crm";
import { useMutation } from "@tanstack/react-query";
import { ListIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTRPC } from "@/data/trpc";
import { useRefreshWork } from "@/data/use-refresh-work";
import { routes } from "@/lib/routes";
import { useMe, viewScope } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { useLeadCounts } from "../list/use-leads";
import { WRITE_HINT_ID } from "./pipeline-card";
import { StageColumn } from "./stage-column";

const boardStages: readonly LeadStage[] = [...openLeadStages, "won"];

export function PipelineScreen() {
  const t = useTranslations("leads");
  const trpc = useTRPC();
  const refresh = useRefreshWork();
  const ownOnly = viewScope(useMe(), "leads:view") !== "all";
  const [view, setView] = useState<"mine" | "everyone">("mine");
  const counts = useLeadCounts({ view, stage: "open", limit: 25 });
  const write = useWriteAccess("change");
  const move = useMutation(trpc.leads.moveStage.mutationOptions());
  const onMove = (lead: Pick<LeadListItem, "id" | "person">, stage: LeadStage) => {
    // A dropped card is refused here too: the api would refuse the move in a read-only agency.
    if (!write.allowed) return;
    move.mutate(
      { leadId: lead.id, stage },
      {
        onSuccess: () => {
          toast.success(t("pipeline.moved", { name: lead.person.name, stage: t(`stages.${stage}`) }));
          void refresh();
        },
      },
    );
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("pipeline.title")}
        intro={t("pipeline.intro")}
        action={
          <Button asChild variant="outline">
            <Link href={routes.leads}>
              <ListIcon aria-hidden="true" />
              {t("pipeline.toList")}
            </Link>
          </Button>
        }
      />
      {!ownOnly && (
        <Tabs
          value={view}
          onValueChange={(chosen) => {
            setView(chosen === "everyone" ? "everyone" : "mine");
          }}
        >
          <TabsList aria-label={t("list.whose")}>
            <TabsTrigger value="mine">{t("list.mine")}</TabsTrigger>
            <TabsTrigger value="everyone">{t("list.everyone")}</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      <WriteHint id={WRITE_HINT_ID} hint={write.hint} />
      {move.isError && <RefusalAlert error={move.error} />}
      <div
        role="region"
        aria-label={t("pipeline.board")}
        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
      >
        {boardStages.map((stage) => (
          <StageColumn
            key={`${view}-${stage}`}
            stage={stage}
            view={view}
            count={isOpenStage(stage) ? counts.data?.[stage] : undefined}
            onMove={onMove}
          />
        ))}
      </div>
    </div>
  );
}
