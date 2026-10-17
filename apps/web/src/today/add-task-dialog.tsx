"use client";

// Add a task, Today's action (spec 3.5, R50): the button, and the form in a dialog (a sheet on phones). It sends a task
// on a lead to leads.addWork and any other to tasks.add, holds while the request is out (rule 7), and on success loads
// Today and the lead again and says so. Adding is a change: while the subscription refuses changes the button is off
// and says why (ADR 0021).
import { useMutation } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { FormDialog, useFormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { useTRPCClient } from "@/data/trpc";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { useRefreshWork } from "@/tasks/use-refresh-work";
import { AddTaskForm, type NewTask } from "./add-task-form";

export function AddTaskDialog() {
  const t = useTranslations("today.addTask");
  const client = useTRPCClient();
  const refresh = useRefreshWork();
  const write = useWriteAccess();
  const hintId = useId();
  const dialog = useFormDialog(t("added"), refresh);
  const add = useMutation({
    mutationFn: (task: NewTask) =>
      task.on === "lead" ? client.leads.addWork.mutate(task.work) : client.tasks.add.mutate(task.task),
    onSuccess: dialog.onSuccess,
  });
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="outline"
        disabled={!write.allowed}
        aria-describedby={write.hint === null ? undefined : hintId}
        onClick={() => {
          dialog.setOpen(true);
        }}
      >
        <PlusIcon aria-hidden="true" />
        {t("action")}
      </Button>
      <WriteHint id={hintId} hint={write.hint} />
      <FormDialog
        dialog={dialog}
        sending={add}
        title={t("title")}
        description={t("description")}
        submit={t("submit")}
        submitting={t("submitting")}
      >
        {(formId) => <AddTaskForm formId={formId} add={add} />}
      </FormDialog>
    </div>
  );
}
