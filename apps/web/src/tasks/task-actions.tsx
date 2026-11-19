"use client";

// Done and Snooze on a follow-up or task (spec 3.5), named for the task: on the lead page two quiet outline buttons with
// their words (plain ink, never link blue: they don't go anywhere; web revamp 2026-11-18), in a table's rows two icons
// (web revamp part 2: Done the row's main move, blue; Snooze ink). onDone lets a screen follow a Done up (Follow-ups
// asks when the next one is). Done goes once; a refusal (a second tab closed it first) shows its own sentence and the
// task stays where it is (Review Focus 5). Both are changes the subscription may refuse (useWriteAccess).
import { useMutation } from "@tanstack/react-query";
import { AlarmClockIcon, CheckIcon, SquareCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { IconButton } from "@/components/icon-button";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTRPC } from "@/data/trpc";
import { useErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { SnoozeDialog } from "./snooze-dialog";
import { useRefreshWork } from "@/data/use-refresh-work";

export function TaskActions({
  task,
  onDone,
  compact = false,
}: {
  task: { id: string; title: string };
  /** Called once the task is done, from the mutation's own options, so it still runs after the row has gone. */
  onDone?: () => void;
  /** Both as icons (IconButton), for a table's rows. */
  compact?: boolean;
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
  const Shape = compact ? IconButton : Button;
  return (
    <div className="flex flex-col gap-1">
      <div className={cn("flex flex-wrap", compact ? "gap-3" : "gap-2")}>
        <Shape
          variant={compact ? "ghost" : "outline"}
          aria-label={t("doneTask", { title: task.title })}
          aria-describedby={described}
          disabled={!write.allowed || complete.isPending}
          onClick={() => {
            complete.mutate({ taskId: task.id });
          }}
        >
          {/* In a row, the tick sits in a box (owner): the one move that finishes the row. */}
          {complete.isPending ? (
            <Spinner />
          ) : compact ? (
            <SquareCheckIcon aria-hidden="true" className="size-5" />
          ) : (
            <CheckIcon aria-hidden="true" />
          )}
          {!compact && t("done")}
        </Shape>
        <Shape
          ref={snoozeButton}
          variant={compact ? "quiet" : "outline"}
          aria-label={t("snoozeTask", { title: task.title })}
          aria-describedby={described}
          disabled={!write.allowed}
          onClick={() => {
            setSnoozing(true);
          }}
        >
          <AlarmClockIcon aria-hidden="true" />
          {!compact && t("snooze")}
        </Shape>
      </div>
      <WriteHint id={hintId} hint={write.hint} />
      <SnoozeDialog taskId={task.id} open={snoozing} onOpenChange={setSnoozing} returnFocusTo={snoozeButton} />
    </div>
  );
}
