"use client";

// Adding a follow-up to a lead (spec 3.4, R25, R50): a short line of what to do and a due day and time on the agency's
// clock, checked by the api's own schema (addLeadWorkInput) before it is sent. It goes to the lead's owner, whoever
// adds it. A FormDialog: held while the request is out; a time the api finds already past is said on the time field,
// where it is fixed.
import { addLeadWorkInput, type AddLeadWorkInput } from "@travel-crm/contracts/crm";
import type { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { checked } from "@/components/forms/checked";
import { DueField, suggestedDue } from "@/components/forms/due-field";
import { FormAlert, FormDialog, useFormDialog, type OpenState, type Sending } from "@/components/forms/form-dialog";
import type { ReturnFocusTo } from "@/components/return-focus";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { useRefusalOnField } from "@/components/forms/use-refusal-on-field";
import { useTRPC } from "@/data/trpc";
import { useRefreshWork } from "@/data/use-refresh-work";
import { useMe } from "@/session/me-context";

export interface FollowUpValues {
  title: string;
  day: string;
  time: string;
}

type Problem = "required" | "title" | "day" | "time";

/**
 * The values as a follow-up's input for these leads (one lead's addWork, or the bulk change's), checked by the api's
 * own schema, or each field's problem: a title, a day and a time are all needed.
 */
export function followUpInput<Input>(schema: z.ZodType<Input>, leads: Record<string, unknown>, values: FollowUpValues) {
  const blank = {
    ...(values.title.trim() === "" && { title: "required" as const }),
    ...(values.day === "" && { day: "day" as const }),
    ...(values.time === "" && { time: "time" as const }),
  };
  return checked(
    schema.safeParse({
      ...leads,
      kind: "follow-up",
      title: values.title,
      due: { on: values.day, at: values.time },
    }),
    values,
    ([part, detail]) => (part === "title" ? "title" : detail === "on" ? "day" : detail === "at" ? "time" : undefined),
    (field): Problem => field,
    blank,
  );
}

/** The follow-up's words and due time, for one lead or many: toInput makes the call's input from them. */
export function FollowUpForm<Input>({
  formId,
  toInput,
  add,
}: {
  formId: string;
  toInput: (values: FollowUpValues) => ReturnType<typeof followUpInput<Input>>;
  add: Sending<Input>;
}) {
  const t = useTranslations("leads.lead.work.dialog");
  const { timeZone } = useMe().organization;
  const { form, onSubmit, formProblem } = useCheckedForm<FollowUpValues, Input, Problem>(
    { title: "", ...suggestedDue(timeZone) },
    toInput,
    (problem) => t(`problems.${problem}`),
  );
  const refusal = useRefusalOnField(form, add.error, { DUE_IN_THE_PAST: "time" });
  return (
    <form id={formId} noValidate onSubmit={onSubmit(add.mutate)} className="flex flex-col gap-4">
      <TextField control={form.control} name="title" label={t("what")} hint={t("whatHint")} autoComplete="off" />
      <DueField control={form.control} dayName="day" timeName="time" label={t("due")} />
      <FormAlert sending={{ error: refusal }} problem={formProblem} />
    </form>
  );
}

export function AddFollowUpDialog({
  leadId,
  dialog,
  returnFocusTo,
}: {
  leadId: string;
  dialog: OpenState;
  /** The card's Add follow-up, which takes the focus back. */
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("leads.lead.work");
  const trpc = useTRPC();
  const refresh = useRefreshWork();
  const held = useFormDialog(t("added"), refresh, dialog);
  const add = useMutation(trpc.leads.addWork.mutationOptions({ onSuccess: held.onSuccess }));
  return (
    <FormDialog
      dialog={held}
      returnFocusTo={returnFocusTo}
      sending={add}
      title={t("dialog.title")}
      description={t("dialog.description")}
      submit={t("dialog.submit")}
      submitting={t("dialog.submitting")}
    >
      {(formId) => (
        <FollowUpForm<AddLeadWorkInput>
          formId={formId}
          toInput={(values) => followUpInput(addLeadWorkInput, { leadId }, values)}
          add={add}
        />
      )}
    </FormDialog>
  );
}
