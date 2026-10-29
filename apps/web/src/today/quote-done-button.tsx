"use client";

// Done on a quote the customer opened and went quiet on (release 5, spec 4.4): marks the opens seen, so the quote leaves
// Today and comes back only if the customer opens it again. A change the subscription may refuse (useWriteAccess).
import type { LeadBrief } from "@travel-crm/contracts/today";
import { useMutation } from "@tanstack/react-query";
import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTRPC } from "@/data/trpc";
import { useRefreshWork } from "@/data/use-refresh-work";
import { useErrorMessage } from "@/lib/error-message";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";

export function QuoteDoneButton({ lead }: { lead: Pick<LeadBrief, "id" | "personName"> }) {
  const t = useTranslations("today.item");
  const trpc = useTRPC();
  const refresh = useRefreshWork();
  const { apiError } = useErrorMessage();
  const write = useWriteAccess();
  const hintId = useId();
  const dismiss = useMutation(
    trpc.today.dismissQuoteOpened.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.success(t("quoteDoneToast"));
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
        aria-label={t("quoteDonePerson", { name: lead.personName })}
        aria-describedby={write.hint === null ? undefined : hintId}
        disabled={!write.allowed || dismiss.isPending}
        onClick={() => {
          dismiss.mutate({ leadId: lead.id });
        }}
      >
        {dismiss.isPending ? <Spinner /> : <CheckIcon aria-hidden="true" />}
        {t("quoteDone")}
      </Button>
      <WriteHint id={hintId} hint={write.hint} />
    </div>
  );
}
