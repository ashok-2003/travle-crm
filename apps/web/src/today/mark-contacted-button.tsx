"use client";

// Mark contacted on a new lead in Today (spec 3.5): moves the lead to Contacted, and Today loads again, so it leaves
// New leads waiting for a reply. It goes once; a refusal (a second tab moved it first) shows its own sentence. A change
// the subscription may refuse (useWriteAccess).
import type { LeadBrief } from "@travel-crm/contracts/today";
import { useMutation } from "@tanstack/react-query";
import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTRPC } from "@/data/trpc";
import { useErrorMessage } from "@/lib/error-message";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { useRefreshWork } from "@/tasks/use-refresh-work";

export function MarkContactedButton({ lead }: { lead: Pick<LeadBrief, "id" | "personName"> }) {
  const t = useTranslations("today.item");
  const trpc = useTRPC();
  const refresh = useRefreshWork();
  const { apiError } = useErrorMessage();
  const write = useWriteAccess();
  const hintId = useId();
  const mark = useMutation(
    trpc.leads.moveStage.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.success(t("markedContacted"));
      },
      onError: (error) => {
        toast.error(apiError(error), { duration: Infinity });
      },
    }),
  );
  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="ghost"
        className="self-start"
        aria-label={t("markContactedPerson", { name: lead.personName })}
        aria-describedby={write.hint === null ? undefined : hintId}
        disabled={!write.allowed || mark.isPending}
        onClick={() => {
          mark.mutate({ leadId: lead.id, stage: "contacted" });
        }}
      >
        {mark.isPending ? <Spinner /> : <CheckIcon aria-hidden="true" />}
        {t("markContacted")}
      </Button>
      <WriteHint id={hintId} hint={write.hint} />
    </div>
  );
}
