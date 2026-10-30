"use client";

// Changing a follow-up (the Follow-ups screen): what to do and when, on the agency's clock (DueField), sent as the api
// takes it (editTaskInput, checked before it is sent). A FormDialog: it holds while the request is out (rule 7), and a
// time the api finds already past is said on the time field. A follow-up moved later is worked by the AI again then.
import type { FollowUpRow } from "@travel-crm/contracts/ai";
import { editTaskInput, type EditTaskInput } from "@travel-crm/contracts/tasks";
import { calendarDateIn, timeOfDayIn } from "@travel-crm/domain/kernel";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { checked } from "@/components/forms/checked";
import { DueField } from "@/components/forms/due-field";
import { FormAlert, FormDialog, useFormDialog, type Sending } from "@/components/forms/form-dialog";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { useRefusalOnField } from "@/components/forms/use-refusal-on-field";
import { FieldGroup } from "@/components/ui/field";
import type { ReturnFocusTo } from "@/components/return-focus";
import { useTRPC } from "@/data/trpc";
import { useRefreshWork } from "@/data/use-refresh-work";
import { useMe } from "@/session/me-context";

interface EditValues {
  title: string;
  day: string;
  time: string;
}

type Problem = "title" | "day" | "time" | "required";

function toEditInput(taskId: string, values: EditValues) {
  const blank = {
    ...(values.day === "" && { day: "day" as const }),
    ...(values.time === "" && { time: "time" as const }),
  };
  return checked(
    editTaskInput.safeParse({ taskId, title: values.title, due: { on: values.day, at: values.time } }),
    values,
    (path) =>
      path.includes("title") ? "title" : path.includes("on") ? "day" : path.includes("at") ? "time" : undefined,
    (field): Problem => field,
    blank,
  );
}

function EditForm({ formId, row, edit }: { formId: string; row: FollowUpRow; edit: Sending<EditTaskInput> }) {
  const t = useTranslations("tasks.followUps.editDialog");
  const { timeZone } = useMe().organization;
  const due = new Date(row.dueAt);
  const { form, onSubmit, formProblem } = useCheckedForm<EditValues, EditTaskInput, Problem>(
    { title: row.title, day: calendarDateIn(due, timeZone), time: timeOfDayIn(due, timeZone) },
    (values) => toEditInput(row.taskId, values),
    (problem) => t(`problems.${problem}`),
  );
  const refusal = useRefusalOnField(form, edit.error, { DUE_IN_THE_PAST: "time" });
  return (
    <form id={formId} noValidate onSubmit={onSubmit(edit.mutate)} className="flex flex-col gap-4">
      <FieldGroup>
        <TextField control={form.control} name="title" label={t("what")} />
        <DueField control={form.control} dayName="day" timeName="time" label={t("when")} />
      </FieldGroup>
      <FormAlert sending={{ error: refusal }} problem={formProblem} />
    </form>
  );
}

export function EditFollowUpDialog({
  row,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  row: FollowUpRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The button that opened it, which takes the focus back when it closes. */
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("tasks.followUps.editDialog");
  const trpc = useTRPC();
  const refresh = useRefreshWork();
  const dialog = useFormDialog(t("saved"), refresh, { open, setOpen: onOpenChange });
  const edit = useMutation(trpc.tasks.edit.mutationOptions({ onSuccess: dialog.onSuccess }));
  return (
    <FormDialog
      returnFocusTo={returnFocusTo}
      dialog={dialog}
      sending={edit}
      title={t("title")}
      description={t("description")}
      submit={t("submit")}
      submitting={t("submitting")}
    >
      {(formId) => <EditForm formId={formId} row={row} edit={edit} />}
    </FormDialog>
  );
}
