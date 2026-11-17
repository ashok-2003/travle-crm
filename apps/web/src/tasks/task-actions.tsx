"use client";

// Done and Snooze on a follow-up or task (spec 3.5), as Today and the lead page show them: two quiet outline buttons
// named for the task (plain ink, never link blue: they don't go anywhere; web revamp 2026-11-18). onDone lets a screen
// follow a Done up (Follow-ups asks when the next one is). Done goes once; a refusal (a second tab closed it first) shows its own sentence and the task stays where
// it is (Review Focus 5). Both are changes the subscription may refuse (useWriteAccess).
import { useMutation } from "@tanstack/react-query";
import { AlarmClockIcon, CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTRPC } from "@/data/trpc";
import { useErrorMessage } from "@/lib/error-message";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { SnoozeDialog } from "./snooze-dialog";
import { useRefreshWork } from "@/data/use-refresh-work";

export function TaskActions({
  task,
  onDone,
}: {
  task: { id: string; title: string };
  /** Called once the task is done, from the mutation's own options, so it still runs after the row has gone. */
  onDone?: () => void;
}) {
  const t = useTranslations("tasks.actions");
  const trpc = useTRPC();
  const refresh = useRefreshWork();
  const { apiError } = useErrorMessage();
  const write = useWriteAccess();
  const hintId = useId();
  const [snoozing, setSnoozing] = useState(false);
  const snoozeButton = useRef<HTMLButtonElement>(null);
  const complete = useMutation(
    trpc.tasks.complete.mutationOptions({
      onSuccess: async () => {
        onDone?.();
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
          variant="outline"
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
          ref={snoozeButton}
          variant="outline"
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
      <SnoozeDialog taskId={task.id} open={snoozing} onOpenChange={setSnoozing} returnFocusTo={snoozeButton} />
    </div>
  );
}
