"use client";

// The bar over the list while leads are chosen (release C): how many, and what can be done to all of them at once:
// move them to a stage, assign them to someone (leads:assign), add a follow-up, or clear the choice. Each change goes
// lead by lead on the api, so a lead it can't change is left as it was and counted in the toast.
import { leadStages, MAX_BULK_LEADS } from "@travel-crm/contracts/crm";
import { useMutation } from "@tanstack/react-query";
import { ChevronDownIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTRPC } from "@/data/trpc";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { StageDot } from "../../stage-badge";
import { BulkFollowUpDialog } from "./bulk-follow-up-dialog";
import { BulkReassignDialog } from "./bulk-reassign-dialog";
import { useBulkDone } from "./use-bulk-done";
import type { LeadSelection } from "./use-lead-selection";

export function BulkBar({ selection }: { selection: LeadSelection }) {
  const t = useTranslations("leads.bulk");
  const tStages = useTranslations("leads.stages");
  const trpc = useTRPC();
  const assigns = useHolds("leads:assign");
  const write = useWriteAccess("change");
  const done = useBulkDone(selection.clear);
  const [dialog, setDialog] = useState<"assign" | "followUp" | null>(null);
  const assignButton = useRef<HTMLButtonElement>(null);
  const followUpButton = useRef<HTMLButtonElement>(null);
  const move = useMutation(trpc.leads.bulkMoveStage.mutationOptions({ onSuccess: done }));
  const leadIds = [...selection.chosen];
  if (leadIds.length === 0) return null;
  const tooMany = leadIds.length > MAX_BULK_LEADS;
  const disabled = tooMany || !write.allowed || move.isPending;
  return (
    <Card aria-label={t("label")} role="region" className="sticky top-2 z-(--z-sticky)">
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto font-medium">{t("chosen", { count: leadIds.length })}</p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={disabled}>
                {t("moveTo")}
                <ChevronDownIcon aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {leadStages.map((stage) => (
                <DropdownMenuItem
                  key={stage}
                  onSelect={() => {
                    move.mutate({ leadIds, stage });
                  }}
                >
                  <StageDot stage={stage} />
                  {tStages(stage)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {assigns && (
            <Button
              ref={assignButton}
              variant="outline"
              disabled={disabled}
              onClick={() => {
                setDialog("assign");
              }}
            >
              {t("assign")}
            </Button>
          )}
          <Button
            ref={followUpButton}
            variant="outline"
            disabled={disabled}
            onClick={() => {
              setDialog("followUp");
            }}
          >
            {t("followUp")}
          </Button>
          <Button variant="ghost" onClick={selection.clear}>
            <XIcon aria-hidden="true" />
            {t("clear")}
          </Button>
        </div>
        {tooMany && <p className="text-label text-muted-foreground">{t("tooMany", { max: MAX_BULK_LEADS })}</p>}
        {!write.allowed && write.hint && <p className="text-label text-muted-foreground">{write.hint}</p>}
        {move.isError && <RefusalAlert error={move.error} />}
      </CardContent>
      <BulkReassignDialog
        leadIds={leadIds}
        open={dialog === "assign"}
        onOpenChange={(open) => {
          setDialog(open ? "assign" : null);
        }}
        onDone={done}
        returnFocusTo={assignButton}
      />
      <BulkFollowUpDialog
        leadIds={leadIds}
        open={dialog === "followUp"}
        onOpenChange={(open) => {
          setDialog(open ? "followUp" : null);
        }}
        onDone={done}
        returnFocusTo={followUpButton}
      />
    </Card>
  );
}
