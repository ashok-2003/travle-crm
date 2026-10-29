"use client";

// "How did the call go?" (release 5, scope 3.4): the call's outcome, one line about it and, if wanted, the next
// follow-up, checked by the api's own schema (logCallInput) before it is sent. A call that was not answered offers a
// follow-up two hours on, which the person can clear. Opened by the Log the call button, or on coming back to the app
// after dialling. Also changes a call written earlier (editCallInput). A FormDialog: held while the request is out.
import {
  callOutcomes,
  editCallInput,
  logCallInput,
  type CallOutcome,
  type EditCallInput,
  type LogCallInput,
} from "@travel-crm/contracts/crm";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef } from "react";
import { checked } from "@/components/forms/checked";
import { ChoiceField } from "@/components/forms/choice-field";
import { DueField, suggestedDue } from "@/components/forms/due-field";
import { FormAlert, FormDialog, useFormDialog, type OpenState } from "@/components/forms/form-dialog";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { useRefusalOnField } from "@/components/forms/use-refusal-on-field";
import type { ReturnFocusTo } from "@/components/return-focus";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { useTRPC } from "@/data/trpc";
import { useRefreshWork } from "@/data/use-refresh-work";
import { NoteField } from "@/leads/form/note-field";
import { useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";

interface Values {
  outcome: CallOutcome;
  note: string;
  followUp: boolean;
  day: string;
  time: string;
}

type Problem = "required" | "tooLong" | "day" | "time";

/** A call already written, being changed. */
export interface ExistingCall {
  callId: string;
  outcome: CallOutcome;
  note: string | null;
}

const MINUTE = 60_000;
/** What an unanswered call offers: the follow-up about two hours on. */
const NO_ANSWER_FOLLOW_UP_MINUTES = 90;

function CallNoteForm({
  formId,
  leadId,
  existing,
  sending,
  send,
}: {
  formId: string;
  leadId: string;
  existing: ExistingCall | undefined;
  sending: { isPending: boolean; error: unknown };
  send: (input: LogCallInput | EditCallInput) => void;
}) {
  const t = useTranslations("leads.call.note");
  const { timeZone } = useMe().organization;
  const followUpId = useId();
  const { form, onSubmit, formProblem } = useCheckedForm<Values, LogCallInput | EditCallInput, Problem>(
    {
      outcome: existing?.outcome ?? "spoke",
      note: existing?.note ?? "",
      followUp: false,
      ...suggestedDue(timeZone),
    },
    (values) => {
      const note = values.note.trim() === "" ? undefined : values.note;
      const blank = {
        ...(values.followUp && values.day === "" && { day: "day" as const }),
        ...(values.followUp && values.time === "" && { time: "time" as const }),
      };
      const fieldAt = (path: readonly PropertyKey[]) =>
        path[0] === "note"
          ? ("note" as const)
          : path[0] === "followUp"
            ? path[2] === "on"
              ? "day"
              : "time"
            : undefined;
      const problemOf = (field: keyof Values): Problem =>
        field === "note" ? "tooLong" : field === "day" ? "day" : "time";
      return existing === undefined
        ? checked<Values, LogCallInput, Problem>(
            logCallInput.safeParse({
              leadId,
              outcome: values.outcome,
              ...(note !== undefined && { note }),
              ...(values.followUp && { followUp: { due: { on: values.day, at: values.time } } }),
            }),
            values,
            fieldAt,
            problemOf,
            blank,
          )
        : checked<Values, EditCallInput, Problem>(
            editCallInput.safeParse({ callId: existing.callId, outcome: values.outcome, note: note ?? null }),
            values,
            fieldAt,
            problemOf,
            blank,
          );
    },
    (problem) => t(`problems.${problem === "required" ? "tooLong" : problem}`),
  );
  const refusal = useRefusalOnField(form, sending.error, { DUE_IN_THE_PAST: "time" });
  // A call nobody answered offers a follow-up to try again, until the person has chosen for themselves.
  const touched = useRef(false);
  const outcome = form.watch("outcome");
  const wantsFollowUp = form.watch("followUp");
  useEffect(() => {
    if (existing !== undefined || touched.current || outcome !== "no_answer") return;
    const later = suggestedDue(timeZone, new Date(Date.now() + NO_ANSWER_FOLLOW_UP_MINUTES * MINUTE));
    form.setValue("followUp", true);
    form.setValue("day", later.day);
    form.setValue("time", later.time);
  }, [outcome, existing, form, timeZone]);
  return (
    <form
      id={formId}
      noValidate
      onSubmit={onSubmit((input) => {
        send(input);
      })}
      className="flex flex-col gap-4"
    >
      <ChoiceField
        control={form.control}
        name="outcome"
        legend={t("outcome")}
        options={callOutcomes.map((value) => ({ value, label: t(`outcomes.${value}`) }))}
      />
      <NoteField
        control={form.control}
        name="note"
        label={t("note")}
        hint={t("noteHint")}
        disabled={sending.isPending}
      />
      {existing === undefined && (
        <>
          <Field orientation="horizontal" className="min-h-11">
            <Checkbox
              id={followUpId}
              checked={wantsFollowUp}
              onCheckedChange={(next) => {
                touched.current = true;
                form.setValue("followUp", next === true);
              }}
            />
            <FieldContent>
              <FieldLabel htmlFor={followUpId} className="font-normal">
                {t("followUp")}
              </FieldLabel>
              <FieldDescription>{t("followUpHint")}</FieldDescription>
            </FieldContent>
          </Field>
          {wantsFollowUp && <DueField control={form.control} dayName="day" timeName="time" label={t("due")} />}
        </>
      )}
      <FormAlert sending={{ error: refusal }} problem={formProblem} />
    </form>
  );
}

export function CallNoteDialog({
  leadId,
  name,
  held,
  existing,
  returnFocusTo,
}: {
  leadId: string;
  name: string;
  held: OpenState;
  existing?: ExistingCall;
  returnFocusTo?: ReturnFocusTo;
}) {
  const t = useTranslations("leads.call.note");
  const trpc = useTRPC();
  const refresh = useRefreshWork();
  const write = useWriteAccess("change");
  const dialog = useFormDialog(t("saved"), refresh, held);
  const log = useMutation(trpc.calls.log.mutationOptions({ onSuccess: dialog.onSuccess }));
  const edit = useMutation(trpc.calls.edit.mutationOptions({ onSuccess: dialog.onSuccess }));
  const sending = existing === undefined ? log : edit;
  return (
    <FormDialog
      dialog={dialog}
      sending={sending}
      returnFocusTo={returnFocusTo}
      canSubmit={write.allowed}
      title={existing === undefined ? t("title") : t("titleEdit")}
      description={existing === undefined ? t("description", { name }) : t("descriptionEdit")}
      submit={t("submit")}
      submitting={t("submitting")}
    >
      {(formId) => (
        <CallNoteForm
          formId={formId}
          leadId={leadId}
          existing={existing}
          sending={sending}
          send={(input) => {
            if ("callId" in input) edit.mutate(input);
            else log.mutate(input);
          }}
        />
      )}
    </FormDialog>
  );
}
