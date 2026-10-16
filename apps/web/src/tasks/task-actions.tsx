"use client";

// Done and Snooze on a follow-up or task (spec 3.5), as Today and the lead page show them: two quiet buttons named for
// the task. Done goes once; a refusal (a second tab closed it first) shows its own sentence and the task stays where
// it is (Review Focus 5). Both are changes the subscription may refuse (useWriteAccess).
import { useMutation } from "@tanstack/react-query";
import { AlarmClockIcon, CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTRPC } from "@/data/trpc";
import { useErrorMessage } from "@/lib/error-message";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { SnoozeDialog } from "./snooze-dialog";
import { useRefreshWork } from "./use-refresh-work";

export function TaskActions({ task }: { task: { id: string; title: string } }) {
  const t = useTranslations("tasks.actions");
  const trpc = useTRPC();
  const refresh = useRefreshWork();
  const { apiError } = useErrorMessage();
  const write = useWriteAccess();
  const hintId = useId();
  const [snoozing, setSnoozing] = useState(false);
  const complete = useMutation(
    trpc.tasks.complete.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.success(t("marked"));
      },
      onError: (error) => {
        toast.error(apiError(error), { duration: Infinity });
      },
    }),
  );
  const described = write.hint === null ? undefined : hintId;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="ghost"
          aria-label={t("doneTask", { title: task.title })}
          aria-describedby={described}
          disabled={!write.allowed || complete.isPending}
          onClick={() => {
            complete.mutate({ taskId: task.id });
          }}
        >
          {complete.isPending ? <Spinner /> : <CheckIcon aria-hidden="true" />}
          {t("done")}
        </Button>
        <Button
          variant="ghost"
          aria-label={t("snoozeTask", { title: task.title })}
          aria-describedby={described}
          disabled={!write.allowed}
          onClick={() => {
            setSnoozing(true);
          }}
        >
          <AlarmClockIcon aria-hidden="true" />
          {t("snooze")}
        </Button>
      </div>
      <WriteHint id={hintId} hint={write.hint} />
      <SnoozeDialog taskId={task.id} open={snoozing} onOpenChange={setSnoozing} />
    </div>
  );
}
