"use client";

// Editing a lead's trip (spec 3.4, P8): the new-lead form's own trip fields, started from the lead's trip
// (tripValuesOf) and checked by the api's schema (editTripInput), which replaces the whole trip. A FormDialog: held
// while saving, a refusal (a destination name the api won't take) shown in it.
import { leadConverter } from "@/ai/fill/fill-converters";
import { FillWithAi } from "@/ai/fill/fill-with-ai";
import { useSuggestedMarks } from "@/ai/fill/use-suggested-marks";
import { FillMarksProvider, useFillMarks } from "@/ai/fill/use-fill-marks";
import { editTripInput, type EditTripInput, type LeadDetail } from "@travel-crm/contracts/crm";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog, type OpenState, type Sending } from "@/components/forms/form-dialog";
import type { ReturnFocusTo } from "@/components/return-focus";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { FieldGroup } from "@/components/ui/field";
import { useTRPC } from "@/data/trpc";
import { useRefreshWork } from "@/data/use-refresh-work";
import {
  emptyLeadValues,
  leadFieldAt,
  leadProblemOf,
  type LeadFormProblem,
  type LeadFormValues,
} from "../form/lead-form-values";
import { TripFields } from "../form/trip-fields";
import { tripInputOf, tripProblems, tripValuesOf } from "../form/trip-values";

function TripForm({ formId, lead, save }: { formId: string; lead: LeadDetail; save: Sending<EditTripInput> }) {
  const t = useTranslations("leads.form");
  const { form, onSubmit, formProblem } = useCheckedForm<LeadFormValues, EditTripInput, LeadFormProblem>(
    { ...emptyLeadValues(""), ...tripValuesOf(lead.trip) },
    (values) =>
      checked(
        editTripInput.safeParse({ leadId: lead.id, trip: tripInputOf(values) }),
        values,
        leadFieldAt,
        leadProblemOf,
        tripProblems(values),
      ),
    (problem) => t(`problems.${problem}`),
  );
  const marks = useFillMarks(form, leadConverter, useSuggestedMarks(lead.id));
  return (
    <FillMarksProvider marks={marks}>
      <form
        id={formId}
        noValidate
        onSubmit={onSubmit((input) => {
          // A trip the AI filled carries which fill and which fields, so the save is audited as drafted by AI.
          const aiFill = marks.use();
          save.mutate(aiFill === undefined ? input : { ...input, aiFill });
        })}
        className="flex flex-col gap-4"
      >
        <FillWithAi target="lead_edit" subjectId={lead.id} marks={marks} />
        <FieldGroup>
          <TripFields form={form} disabled={save.isPending} />
        </FieldGroup>
        <FormAlert sending={save} problem={formProblem} />
      </form>
    </FillMarksProvider>
  );
}

export function EditTripDialog({
  lead,
  dialog,
  returnFocusTo,
}: {
  lead: LeadDetail;
  dialog: OpenState;
  /** The card's Edit, which takes the focus back. */
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("leads.lead.trip");
  const trpc = useTRPC();
  const refresh = useRefreshWork();
  const held = useFormDialog(t("saved"), refresh, dialog);
  const save = useMutation(trpc.leads.editTrip.mutationOptions({ onSuccess: held.onSuccess }));
  return (
    <FormDialog
      dialog={held}
      returnFocusTo={returnFocusTo}
      sending={save}
      title={t("dialog.title")}
      description={t("dialog.description")}
      submit={t("dialog.submit")}
      submitting={t("dialog.submitting")}
    >
      {(formId) => <TripForm formId={formId} lead={lead} save={save} />}
    </FormDialog>
  );
}
