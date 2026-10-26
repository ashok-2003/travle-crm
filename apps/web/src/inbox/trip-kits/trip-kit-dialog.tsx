"use client";

// Add or change a trip's details (sales inbox, trip details): its name, the words sent first (itinerary, inclusions, price,
// payment details), the keywords that send it by themselves, and whether they do. Its files are added on the trip's card,
// once it exists. Checked by the api's own schema before it is sent.
import { createTripKitInput, type CreateTripKitInput, type TripKit } from "@travel-crm/contracts/inbox";
import { useTranslations } from "next-intl";
import { Controller } from "react-hook-form";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog, type OpenState } from "@/components/forms/form-dialog";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import type { ReturnFocusTo } from "@/components/return-focus";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { NoteField } from "@/leads/form/note-field";
import { useSaveTripKit } from "./use-trip-kits";

interface Values {
  name: string;
  message: string;
  /** Typed with commas between: "manali, kullu manali". */
  keywords: string;
  autoSend: boolean;
}
type Problem = "required" | "tooLong" | "keywords";
const fields = ["name", "message", "keywords"] as const;

/** The keywords as typed, one per comma. */
const keywordsOf = (text: string) =>
  text
    .split(",")
    .map((word) => word.trim())
    .filter((word) => word !== "");

function TripKitForm({
  formId,
  existing,
  onSave,
  sending,
}: {
  formId: string;
  existing: TripKit | undefined;
  onSave: (input: CreateTripKitInput) => void;
  sending: { isPending: boolean; error: unknown };
}) {
  const t = useTranslations("inbox.tripKits.form");
  const { form, onSubmit, formProblem } = useCheckedForm<Values, CreateTripKitInput, Problem>(
    {
      name: existing?.name ?? "",
      message: existing?.message ?? "",
      keywords: existing?.keywords.join(", ") ?? "",
      autoSend: existing?.autoSend ?? true,
    },
    (values) =>
      checked(
        createTripKitInput.safeParse({ ...values, keywords: keywordsOf(values.keywords) }),
        values,
        (path) => fields.find((field) => field === path[0]),
        (field) => (field === "keywords" ? "keywords" : "tooLong"),
      ),
    (problem) => t(`problems.${problem}`),
  );
  return (
    <form id={formId} noValidate onSubmit={onSubmit(onSave)} className="flex flex-col gap-4">
      <TextField
        control={form.control}
        name="name"
        label={t("name")}
        hint={t("nameHint")}
        autoComplete="off"
        disabled={sending.isPending}
      />
      <NoteField
        control={form.control}
        name="message"
        label={t("message")}
        hint={t("messageHint")}
        disabled={sending.isPending}
      />
      <TextField
        control={form.control}
        name="keywords"
        label={t("keywords")}
        hint={t("keywordsHint")}
        autoComplete="off"
        disabled={sending.isPending}
      />
      <Controller
        control={form.control}
        name="autoSend"
        render={({ field }) => (
          <div className="flex min-h-11 items-center gap-3">
            <Switch
              id={`${formId}-auto`}
              checked={field.value}
              onCheckedChange={field.onChange}
              disabled={sending.isPending}
            />
            <Label htmlFor={`${formId}-auto`}>{t("autoSend")}</Label>
          </div>
        )}
      />
      <FormAlert sending={sending} problem={formProblem} />
    </form>
  );
}

export function TripKitDialog({
  existing,
  held,
  returnFocusTo,
}: {
  existing?: TripKit;
  held?: OpenState;
  returnFocusTo?: ReturnFocusTo;
}) {
  const t = useTranslations("inbox.tripKits");
  const dialog = useFormDialog(existing === undefined ? t("added") : t("saved"), undefined, held);
  const { create, update } = useSaveTripKit();
  const sending = existing === undefined ? create : update;
  const onSave = (input: CreateTripKitInput) => {
    if (existing === undefined) create.mutate(input, { onSuccess: () => void dialog.onSuccess() });
    else update.mutate({ tripKitId: existing.id, ...input }, { onSuccess: () => void dialog.onSuccess() });
  };
  return (
    <FormDialog
      dialog={dialog}
      sending={sending}
      {...(held === undefined && { trigger: { label: t("add"), variant: "default" as const } })}
      returnFocusTo={returnFocusTo}
      title={existing === undefined ? t("addTitle") : t("editTitle")}
      description={t("dialogDescription")}
      submit={t("save")}
      submitting={t("saving")}
    >
      {(formId) => <TripKitForm formId={formId} existing={existing} onSave={onSave} sending={sending} />}
    </FormDialog>
  );
}
