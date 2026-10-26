"use client";

// The sale, worked from the chat's bar (sales inbox spec, design v2), as the sales inboxes do: the lead's owner as a menu
// to give it to someone (for whoever may assign), the lead's stage as its coloured pill and a menu to move it (Won is
// "converted"; for whoever may edit leads), and how long the 24-hour window stays open ("23h left", red in its last two
// hours). Each change goes through the lead's own procedures, so it is audited and every list shows it.
import { leadStages, type LeadStage } from "@travel-crm/contracts/crm";
import type { ConversationHeader } from "@travel-crm/contracts/inbox";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDownIcon, ClockIcon, UserRoundIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { statusToneClasses } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTRPC } from "@/data/trpc";
import { useRefreshWork } from "@/data/use-refresh-work";
import { StageDot, stageTones } from "@/leads/stage-badge";
import { useErrorMessage } from "@/lib/error-message";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { useOwners } from "./use-owner-names";

/** After a change to the lead: the lead's own screens, and the inbox's list and this chat's bar. */
function useAfterLeadChange() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refreshWork = useRefreshWork();
  return async () => {
    await Promise.all([refreshWork(), queryClient.invalidateQueries({ queryKey: trpc.inbox.pathKey() })]);
  };
}

export function StageMenu({ header }: { header: ConversationHeader }) {
  const t = useTranslations("inbox.chat");
  const tStages = useTranslations("leads.stages");
  const trpc = useTRPC();
  const { apiError } = useErrorMessage();
  const access = useWriteAccess("change");
  const mayEdit = useHolds("leads:edit");
  const after = useAfterLeadChange();
  const move = useMutation(
    trpc.leads.moveStage.mutationOptions({
      onSuccess: async (_, { stage }) => {
        await after();
        toast.success(t("stageMoved", { stage: tStages(stage) }));
      },
      onError: (error) => toast.error(apiError(error)),
    }),
  );
  if (header.lead === null) return null;
  const stage = header.lead.stage as LeadStage;
  const pill = cn("h-9 gap-1.5 rounded-full px-3 text-label font-medium hover:opacity-90", stageTones[stage].badge);
  if (!mayEdit) {
    return (
      <span className={cn("inline-flex items-center", pill)}>
        <StageDot stage={stage} />
        {tStages(stage)}
      </span>
    );
  }
  const leadId = header.lead.id;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={pill}
          disabled={!access.allowed || move.isPending}
          aria-label={t("stageMenu", { stage: tStages(stage) })}
        >
          <StageDot stage={stage} />
          {tStages(stage)}
          <ChevronDownIcon aria-hidden="true" className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("moveTo")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={stage}
          onValueChange={(chosen) => {
            const next = leadStages.find((candidate) => candidate === chosen);
            if (next !== undefined && next !== stage) move.mutate({ leadId, stage: next });
          }}
        >
          {leadStages.map((value) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <StageDot stage={value} />
              {value === "won" ? t("wonConverted") : tStages(value)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function OwnerMenu({ header }: { header: ConversationHeader }) {
  const t = useTranslations("inbox.chat");
  const trpc = useTRPC();
  const { apiError } = useErrorMessage();
  const access = useWriteAccess("change");
  const mayAssign = useHolds("leads:assign");
  const { owners, nameOf } = useOwners();
  const after = useAfterLeadChange();
  const reassign = useMutation(
    trpc.leads.reassign.mutationOptions({
      onSuccess: async (_, { ownerUserId }) => {
        await after();
        toast.success(t("ownerChanged", { name: nameOf(ownerUserId) ?? "" }));
      },
      onError: (error) => toast.error(apiError(error)),
    }),
  );
  if (header.lead === null) return null;
  const ownerId = header.lead.ownerUserId;
  const label = nameOf(ownerId) ?? t("noOwner");
  if (!mayAssign) {
    return (
      <span className="inline-flex h-9 max-w-40 items-center gap-1.5 text-label text-muted-foreground">
        <UserRoundIcon aria-hidden="true" className="size-4 shrink-0" />
        <span className="truncate">{label}</span>
      </span>
    );
  }
  const leadId = header.lead.id;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-9 max-w-44 gap-1.5 rounded-full px-3 text-label"
          disabled={!access.allowed || reassign.isPending}
          aria-label={t("ownerMenu", { name: label })}
        >
          <UserRoundIcon aria-hidden="true" />
          <span className="truncate">{label}</span>
          <ChevronDownIcon aria-hidden="true" className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("giveTo")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={ownerId ?? ""}
          onValueChange={(chosen) => {
            if (chosen !== "" && chosen !== ownerId) reassign.mutate({ leadId, ownerUserId: chosen });
          }}
        >
          {owners.map((owner) => (
            <DropdownMenuRadioItem key={owner.userId} value={owner.userId}>
              {owner.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const HOUR = 3_600_000;

/** "23h left" while the 24-hour window is open (red in its last two hours), "Window closed" once it is not. */
export function WindowChip({ header }: { header: ConversationHeader }) {
  const t = useTranslations("inbox.chat");
  const now = useNow();
  if (header.lastInboundAt === null) return null;
  const left = header.windowOpenUntil === null ? 0 : new Date(header.windowOpenUntil).getTime() - now.getTime();
  const tone = left <= 0 ? "neutral" : left < 2 * HOUR ? "bad" : "good";
  const words =
    left <= 0
      ? t("windowChipClosed")
      : left < HOUR
        ? t("windowChipMinutes", { minutes: Math.max(1, Math.floor(left / 60_000)) })
        : t("windowChipHours", { hours: Math.floor(left / HOUR) });
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-1.5 text-caption font-medium",
        statusToneClasses[tone].badge,
      )}
      title={t("windowChipHint")}
    >
      <ClockIcon aria-hidden="true" className="size-3" />
      {words}
    </span>
  );
}
