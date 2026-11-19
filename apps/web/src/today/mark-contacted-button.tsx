"use client";

// Mark contacted on a new lead in My tasks (spec 3.5): moves the lead to Contacted as the lead's own stage bar does
// (useMoveStage), so My tasks, the Leads list and its chips' counts load again and the lead leaves New leads. The row's
// main move, so an icon in blue (web revamp part 2). It goes once; a refusal (a second tab moved it first) shows its
// own sentence. A change the subscription may refuse (useWriteAccess).
import type { LeadBrief } from "@travel-crm/contracts/today";
import { SquareCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { toast } from "sonner";
import { IconButton } from "@/components/icon-button";
import { Spinner } from "@/components/ui/spinner";
import { useMoveStage } from "@/leads/lead/use-lead";
import { useErrorMessage } from "@/lib/error-message";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";

export function MarkContactedButton({ lead }: { lead: Pick<LeadBrief, "id" | "personName"> }) {
  const t = useTranslations("today.item");
  const move = useMoveStage();
  const { apiError } = useErrorMessage();
  const write = useWriteAccess();
  const hintId = useId();
  return (
    <div className="flex flex-col gap-1">
      <IconButton
        variant="ghost"
        aria-label={t("markContactedPerson", { name: lead.personName })}
        aria-describedby={write.hint === null ? undefined : hintId}
        disabled={!write.allowed || move.isPending}
        onClick={() => {
          // A refusal leaves the row in place, so the button is still here to say it.
          move.mutate(
            { leadId: lead.id, stage: "contacted" },
            {
              onError: (error) => {
                toast.error(apiError(error), { duration: Infinity });
              },
            },
          );
        }}
      >
        {move.isPending ? <Spinner /> : <SquareCheckIcon aria-hidden="true" className="size-5" />}
      </IconButton>
      <WriteHint id={hintId} hint={write.hint} />
    </div>
  );
}
