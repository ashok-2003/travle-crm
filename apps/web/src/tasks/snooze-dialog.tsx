"use client";

// Snoozing a follow-up or task (spec 3.5): one hour on, tomorrow morning at 9:00 on the agency's clock, or a chosen
// day and time (DueField), as the api takes them (snoozeTaskInput, checked before it is sent). A FormDialog: it holds
// while the request is out (rule 7), and what follows success lands even once it closes.
import { snoozeTaskInput, type SnoozeUntil } from "@travel-crm/contracts/tasks";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Controller } from "react-hook-form";
import { checked } from "@/components/forms/checked";
import { DueField, suggestedDue } from "@/components/forms/due-field";
import { FormAlert, FormDialog, useFormDialog, type Sending } from "@/components/forms/form-dialog";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { ReturnFocusTo } from "@/components/return-focus";
import { useTRPC } from "@/data/trpc";
import { useRefreshWork } from "@/data/use-refresh-work";
import { useMe } from "@/session/me-context";

const choices = ["one-hour", "tomorrow-morning", "at"] as const;

interface SnoozeValues {
  choice: (typeof choices)[number];
  day: string;
  time: string;
}

type Problem = "day" | "time" | "required";

const choiceWords = { "one-hour": "oneHour", "tomorrow-morning": "tomorrowMorning", at: "choose" } as const;

/** The form's values as the api's input, or the problem on each field: a chosen time needs its day and its time. */
function toSnoozeInput(taskId: string, values: SnoozeValues) {
  const until =
    values.choice === "at"
      ? { choice: values.choice, due: { on: values.day, at: values.time } }
      : { choice: values.choice };
  const blank =
    values.choice === "at"
      ? { ...(values.day === "" && { day: "day" as const }), ...(values.time === "" && { time: "time" as const }) }
      : {};
  return checked(
    snoozeTaskInput.safeParse({ taskId, until }),
    values,
    (path) => (path.includes("on") ? "day" : path.includes("at") ? "time" : undefined),
    (field): Problem => (field === "day" ? "day" : "time"),
    blank,
  );
}

function SnoozeForm({
  formId,
  taskId,
  snooze,
}: {
  formId: string;
  taskId: string;
  snooze: Sending<{ taskId: string; until: SnoozeUntil }>;
}) {
  const t = useTranslations("tasks.snooze");
  const { timeZone } = useMe().organization;
  const { form, onSubmit, formProblem } = useCheckedForm<SnoozeValues, { taskId: string; until: SnoozeUntil }, Problem>(
    { choice: "one-hour", ...suggestedDue(timeZone) },
    (values) => toSnoozeInput(taskId, values),
    (problem) => t(`problems.${problem}`),
  );
  const choice = form.watch("choice");
  return (
    <form id={formId} noValidate onSubmit={onSubmit(snooze.mutate)} className="flex flex-col gap-4">
      <FieldGroup>
        <Field>
          <FieldLabel id={`${formId}-choice`}>{t("choice")}</FieldLabel>
          <Controller
            control={form.control}
            name="choice"
            render={({ field }) => (
              <RadioGroup aria-labelledby={`${formId}-choice`} value={field.value} onValueChange={field.onChange}>
                {choices.map((value) => (
                  <div key={value} className="flex min-h-11 items-center gap-3">
                    <RadioGroupItem value={value} id={`${formId}-${value}`} />
                    <FieldLabel htmlFor={`${formId}-${value}`} className="font-normal">
                      {t(choiceWords[value])}
                    </FieldLabel>
                  </div>
                ))}
              </RadioGroup>
            )}
          />
        </Field>
        {choice === "at" && <DueField control={form.control} dayName="day" timeName="time" label={t("when")} />}
      </FieldGroup>
      <FormAlert sending={snooze} problem={formProblem} />
    </form>
  );
}

export function SnoozeDialog({
  taskId,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  taskId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The button that opened it, which takes the focus back when it closes. */
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("tasks.snooze");
  const trpc = useTRPC();
  const refresh = useRefreshWork();
  const dialog = useFormDialog(t("snoozed"), refresh, { open, setOpen: onOpenChange });
  const snooze = useMutation(trpc.tasks.snooze.mutationOptions({ onSuccess: dialog.onSuccess }));
  return (
    <FormDialog
      returnFocusTo={returnFocusTo}
      dialog={dialog}
      sending={snooze}
      title={t("title")}
      description={t("description")}
      submit={t("submit")}
      submitting={t("submitting")}
    >
      {(formId) => <SnoozeForm formId={formId} taskId={taskId} snooze={snooze} />}
    </FormDialog>
  );
}
