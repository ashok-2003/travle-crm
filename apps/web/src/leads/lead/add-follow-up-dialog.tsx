"use client";

// Adding a follow-up to a lead (spec 3.4, R25, R50): a short line of what to do and a due day and time on the agency's
// clock, checked by the api's own schema (addLeadWorkInput) before it is sent. It goes to the lead's owner, whoever
// adds it. A FormDialog: held while the request is out, a time already past refused with its sentence.
import { addLeadWorkInput, type AddLeadWorkInput } from "@travel-crm/contracts/crm";
import { calendarDateIn } from "@travel-crm/domain/kernel";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { checked } from "@/components/forms/checked";
import { DueField } from "@/components/forms/due-field";
import { FormAlert, FormDialog, useFormDialog, type OpenState, type Sending } from "@/components/forms/form-dialog";
import type { ReturnFocusTo } from "@/components/return-focus";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { useTRPC } from "@/data/trpc";
import { useMe } from "@/session/me-context";
import { useRefreshLeads } from "./use-lead";

interface FollowUpValues {
  title: string;
  day: string;
  time: string;
}

type Problem = "required" | "title" | "day" | "time";

/** The values as addWork's input, or each field's problem: a title, a day and a time are all needed. */
function toAddWorkInput(leadId: string, values: FollowUpValues) {
  const blank = {
    ...(values.title.trim() === "" && { title: "required" as const }),
    ...(values.day === "" && { day: "day" as const }),
    ...(values.time === "" && { time: "time" as const }),
  };
  return checked(
    addLeadWorkInput.safeParse({
      leadId,
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

function FollowUpForm({ formId, leadId, add }: { formId: string; leadId: string; add: Sending<AddLeadWorkInput> }) {
  const t = useTranslations("leads.lead.work.dialog");
  const { timeZone } = useMe().organization;
  const { form, onSubmit, formProblem } = useCheckedForm<FollowUpValues, AddLeadWorkInput, Problem>(
    { title: "", day: calendarDateIn(new Date(), timeZone), time: "" },
    (values) => toAddWorkInput(leadId, values),
    (problem) => t(`problems.${problem}`),
  );
  return (
    <form id={formId} noValidate onSubmit={onSubmit(add.mutate)} className="flex flex-col gap-4">
      <TextField control={form.control} name="title" label={t("what")} hint={t("whatHint")} autoComplete="off" />
      <DueField control={form.control} dayName="day" timeName="time" label={t("due")} />
      <FormAlert sending={add} problem={formProblem} />
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
  const refresh = useRefreshLeads();
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
      {(formId) => <FollowUpForm formId={formId} leadId={leadId} add={add} />}
    </FormDialog>
  );
}
