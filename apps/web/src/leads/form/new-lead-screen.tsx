"use client";

// /leads/new (spec 3.2, R40): one form, quick to fill on a phone; only a name and one contact are needed. Once a
// contact is typed the form says whose it is (KnownContactAlert) and, for an open lead, asks what to do with this
// enquiry; while that is unmade, Save focuses the choice and says so above itself. The api asks again
// (OPEN_LEAD_EXISTS) when a colleague's save got there first. Checked by the api's own schema before it is sent, and
// held while saving. Saved, it opens the lead; added to a lead the person can't see, it returns to Leads, saying whose
// lead it went to (R53).
import type { KnownContactResult } from "@travel-crm/contracts/crm";
import { useMutation } from "@tanstack/react-query";
import { CircleAlertIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { toast } from "sonner";
import { AiMark } from "@/ai/fill/ai-mark";
import { leadConverter } from "@/ai/fill/fill-converters";
import { FillWithAi } from "@/ai/fill/fill-with-ai";
import { FillMarksProvider, useFillMarks } from "@/ai/fill/use-fill-marks";
import { FormAlert } from "@/components/forms/form-dialog";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { PageHeader } from "@/components/page-header";
import { BackLink } from "@/components/text-link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { refusalOf } from "@/data/api-error";
import { useTRPC } from "@/data/trpc";
import { useRefreshWork } from "@/data/use-refresh-work";
import { leadRoute, routes } from "@/lib/routes";
import { useHolds, useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { KnownContactAlert } from "./known-contact-alert";
import { emptyLeadValues, toCreateLeadInput } from "./lead-form-values";
import { NoteField } from "./note-field";
import { OwnerField } from "./owner-field";
import { PersonFields } from "./person-fields";
import { SourceFields } from "./source-fields";
import { TripFields } from "./trip-fields";
import { knownContactsOf, useKnownContact } from "./use-known-contact";

/** Whose open lead the known contact has, by name, for the toast after adding to it. */
function openLeadOwner(known: KnownContactResult | undefined): string | null {
  const ownerUserId = known?.match?.openLead?.ownerUserId;
  return ownerUserId ? (known.people[ownerUserId] ?? null) : null;
}

export function NewLeadScreen() {
  const t = useTranslations("leads.form");
  const me = useMe();
  const router = useRouter();
  const trpc = useTRPC();
  const refresh = useRefreshWork();
  const assigns = useHolds("leads:assign");
  const write = useWriteAccess("change");
  const hintId = useId();

  const { form, onSubmit, formProblem } = useCheckedForm(
    emptyLeadValues(me.user.id),
    (values) => toCreateLeadInput(values, { userId: me.user.id }),
    (problem) => t(`problems.${problem}`),
  );
  const marks = useFillMarks(form, leadConverter);
  // "Make a lead from this chat" opens this form with the chat's id: the AI reads the chat at once.
  const chat = useSearchParams().get("chat");
  const chatId = chat !== null && /^[0-9a-f-]{36}$/i.test(chat) ? chat : undefined;
  const [phone, email, instagramHandle] = form.watch(["phone", "email", "instagramHandle"]);
  const known = useKnownContact(knownContactsOf({ phone, email, instagramHandle }));

  const create = useMutation(
    trpc.leads.create.mutationOptions({
      onSuccess: async (created) => {
        // A destination typed in is on the agency's list now, and the lists show it.
        await refresh();
        if (created.leadId === null) {
          const owner = openLeadOwner(known.data);
          toast.success(owner === null ? t("addedToOpenLead") : t("addedToTheirLead", { owner }));
          router.push(routes.leads);
          return;
        }
        toast.success(created.outcome === "created" ? t("added") : t("addedToOpenLead"));
        router.push(leadRoute(created.leadId));
      },
      onError: (error) => {
        // A colleague's lead for the same person got there first: ask about it.
        if (refusalOf(error)?.reason === "OPEN_LEAD_EXISTS") void known.refetch();
      },
    }),
  );
  // The choice is asked while the contact as typed has an open lead, which the form then shows with it; the api's
  // OPEN_LEAD_EXISTS only refetches that and says why the form asks now.
  const askOpenLead = Boolean(known.data?.match?.openLead);
  const openLeadNow = refusalOf(create.error)?.reason === "OPEN_LEAD_EXISTS";
  const send = onSubmit((input) => {
    if (askOpenLead && input.whenOpenLead === null) {
      form.setError("whenOpenLead", { message: t("problems.openLead") }, { shouldFocus: true });
    } else {
      // A form the AI filled carries which fill and which fields, so the save is audited as drafted by AI.
      const aiFill = marks.use();
      create.mutate(aiFill === undefined ? input : { ...input, aiFill });
    }
  });
  const choiceMissing = form.formState.errors.whenOpenLead !== undefined;
  // Above Save, so a phone's person sees why nothing was sent, though the choice is far up the form.
  const choiceSentence =
    askOpenLead && (openLeadNow ? t("known.chooseThenSave") : choiceMissing && t("known.chooseFirst"));
  const saving = create.isPending;
  const legend = "text-section font-semibold";

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <BackLink href={routes.leads} label={t("back")} />
      <PageHeader title={t("title")} intro={t("intro")} />
      <FillMarksProvider marks={marks}>
        <FillWithAi target="lead" marks={marks} chatId={chatId} startOpen={chatId !== undefined} />
        <form noValidate onSubmit={send} className="flex flex-col gap-8">
          <FieldSet disabled={saving}>
            <FieldLegend className={legend}>{t("person.legend")}</FieldLegend>
            <PersonFields form={form} />
            {known.data && <KnownContactAlert known={known.data} form={form} />}
          </FieldSet>
          <FieldSet disabled={saving}>
            <FieldLegend className={legend}>{t("trip.legend")}</FieldLegend>
            <TripFields form={form} disabled={saving} />
            <AiMark paths={["note"]}>
              <NoteField control={form.control} name="note" label={t("note")} hint={t("noteHint")} />
            </AiMark>
          </FieldSet>
          <FieldSet disabled={saving}>
            <FieldLegend className={legend}>{t("source.legend")}</FieldLegend>
            <SourceFields form={form} disabled={saving} />
            {assigns && <OwnerField form={form} disabled={saving} />}
          </FieldSet>
          {choiceSentence ? (
            <Alert variant="destructive">
              <CircleAlertIcon aria-hidden="true" />
              <AlertDescription>{choiceSentence}</AlertDescription>
            </Alert>
          ) : (
            <FormAlert sending={create} problem={formProblem} />
          )}
          <div className="flex flex-col gap-1">
            <Button
              type="submit"
              disabled={saving || !write.allowed}
              aria-describedby={write.hint === null ? undefined : hintId}
              className="w-full md:w-auto md:self-start"
            >
              {saving && <Spinner />}
              {saving ? t("saving") : t("save")}
            </Button>
            <WriteHint id={hintId} hint={write.hint} />
          </div>
        </form>
      </FillMarksProvider>
    </div>
  );
}
