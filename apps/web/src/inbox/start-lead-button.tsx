"use client";

// Start a new lead (Q2): a past customer's chat waits in the inbox with this button instead of making a lead by itself. The
// api checks the person has no open lead and assigns the new one by the agency's rules; the lead's page then opens.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTRPC } from "@/data/trpc";
import { useRefreshWork } from "@/data/use-refresh-work";
import { leadRoute } from "@/lib/routes";
import { WriteHint } from "@/subscription/write-hint";
import { useWriteAccess } from "@/subscription/write-access";

export function StartLeadButton({ conversationId }: { conversationId: string }) {
  const t = useTranslations("inbox.chat");
  const trpc = useTRPC();
  const router = useRouter();
  const refresh = useRefreshWork();
  const queryClient = useQueryClient();
  const access = useWriteAccess("change");
  const start = useMutation(
    trpc.inbox.startLead.mutationOptions({
      onSuccess: async ({ leadId }) => {
        await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: trpc.inbox.pathKey() })]);
        router.push(leadRoute(leadId));
      },
    }),
  );
  return (
    <div className="flex flex-col gap-2">
      <Button
        className="self-start"
        disabled={!access.allowed || start.isPending}
        aria-describedby={access.allowed ? undefined : "start-lead-hint"}
        onClick={() => {
          start.mutate({ conversationId });
        }}
      >
        {start.isPending && <Spinner />}
        {t("startLead")}
      </Button>
      <WriteHint id="start-lead-hint" hint={access.hint} />
      {start.isError && <RefusalAlert error={start.error} />}
    </div>
  );
}
