"use client";

// Editing a lead's person (spec 3.4, 4, R32, P7, P10): the new-lead form's own person fields, checked by the api's
// schema (editPersonInput). A contact already on another live person is refused by the api with a sentence that can't
// name them, so before saving the editor asks knownContact about each contact that changed, one at a time, and names
// whoever holds it; one that turns out to be this person's own says nothing. A FormDialog: held while saving.
import type { ContactKind, EditPersonInput, LeadDetail } from "@travel-crm/contracts/crm";
import { editPersonInput } from "@travel-crm/contracts/crm";
import { useMutation } from "@tanstack/react-query";
import { TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog, type OpenState, type Sending } from "@/components/forms/form-dialog";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useTRPC } from "@/data/trpc";
import {
  emptyLeadValues,
  leadFieldAt,
  leadProblemOf,
  personInputOf,
  personProblems,
  type LeadFormProblem,
  type LeadFormValues,
} from "../form/lead-form-values";
import { PersonFields } from "../form/person-fields";
import { knownContactsOf, useKnownContact } from "../form/use-known-contact";
import { useRefreshLeads } from "./use-lead";

/** A stored number as the phone field shows it: an Indian one after its +91, any other whole. */
const phoneFieldText = (e164: string | null) =>
  e164 === null ? "" : /^\+91\d{10}$/.test(e164) ? `${e164.slice(3, 8)} ${e164.slice(8)}` : e164;

/** Who else holds a contact typed here: the one kind asked about, if it changed and isn't this person's own. */
function useHolder(person: LeadDetail["person"], kind: ContactKind, typed: string) {
  const key = kind === "instagram" ? "instagramHandle" : kind;
  const contact = knownContactsOf({ [key]: typed });
  const changed = contact !== null && contact[key] !== person[key];
  const known = useKnownContact(changed ? contact : null);
  const match = changed ? known.data?.match : null;
  return match && match.personId !== person.id ? { kind, name: match.personName } : null;
}

function PersonForm({ formId, lead, save }: { formId: string; lead: LeadDetail; save: Sending<EditPersonInput> }) {
  const t = useTranslations("leads");
  const { person } = lead;
  const { form, onSubmit, formProblem } = useCheckedForm<LeadFormValues, EditPersonInput, LeadFormProblem>(
    {
      ...emptyLeadValues(""),
      name: person.name,
      phone: phoneFieldText(person.phone),
      email: person.email ?? "",
      instagramHandle: person.instagramHandle ?? "",
    },
    (values) =>
      checked(
        editPersonInput.safeParse({ leadId: lead.id, person: personInputOf(values) }),
        values,
        leadFieldAt,
        leadProblemOf,
        personProblems(values),
      ),
    (problem) => t(`form.problems.${problem}`),
  );
  const [phone, email, handle] = form.watch(["phone", "email", "instagramHandle"]);
  const holders = [
    useHolder(person, "phone", phone),
    useHolder(person, "email", email),
    useHolder(person, "instagram", handle),
  ].filter((holder) => holder !== null);
  return (
    <form id={formId} noValidate onSubmit={onSubmit(save.mutate)} className="flex flex-col gap-4">
      <PersonFields form={form} />
      {holders.map((holder) => (
        <Alert key={holder.kind}>
          <TriangleAlertIcon aria-hidden="true" />
          <AlertDescription className="script-leading">
            {t("lead.person.holder", { contact: t(`lead.person.contactKinds.${holder.kind}`), name: holder.name })}
          </AlertDescription>
        </Alert>
      ))}
      <FormAlert sending={save} problem={formProblem} />
    </form>
  );
}

export function EditPersonDialog({ lead, dialog }: { lead: LeadDetail; dialog: OpenState }) {
  const t = useTranslations("leads.lead.person");
  const trpc = useTRPC();
  const refresh = useRefreshLeads();
  const held = useFormDialog(t("saved"), refresh, dialog);
  const save = useMutation(trpc.leads.editPerson.mutationOptions({ onSuccess: held.onSuccess }));
  return (
    <FormDialog
      dialog={held}
      sending={save}
      title={t("dialog.title")}
      description={t("dialog.description")}
      submit={t("dialog.submit")}
      submitting={t("dialog.submitting")}
    >
      {(formId) => <PersonForm formId={formId} lead={lead} save={save} />}
    </FormDialog>
  );
}
