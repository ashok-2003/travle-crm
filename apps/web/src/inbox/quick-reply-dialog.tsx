"use client";

// Add or change a quick reply (sales inbox spec, section 5): its shortcut (typed after "/"), a title to find it by, and the
// words, with the blanks the reply bar fills from the chat. Checked by the api's own schema before it is sent. The words
// of the reply with the shortcut "payment" are also the reply bar's Payment details.
import { createQuickReplyInput, type CreateQuickReplyInput, type QuickReply } from "@travel-crm/contracts/inbox";
import { useTranslations } from "next-intl";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog, type OpenState } from "@/components/forms/form-dialog";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import type { ReturnFocusTo } from "@/components/return-focus";
import { NoteField } from "@/leads/form/note-field";
import { useSaveQuickReply } from "./use-inbox-tools";

interface Values { shortcut: string; title: string; body: string }
type Problem = "required" | "shortcut" | "tooLong";

function QuickReplyForm({
  formId,
  existing,
  onSave,
  sending,
}: {
  formId: string;
  existing: QuickReply | undefined;
  onSave: (input: CreateQuickReplyInput) => void;
  sending: { isPending: boolean; error: unknown };
}) {
  const t = useTranslations("inbox.quickReplies.form");
  const { form, onSubmit, formProblem } = useCheckedForm<Values, CreateQuickReplyInput, Problem>(
    { shortcut: existing?.shortcut ?? "", title: existing?.title ?? "", body: existing?.body ?? "" },
    (values) =>
      checked(
        createQuickReplyInput.safeParse(values),
        values,
        (path) => (path[0] === "shortcut" || path[0] === "title" || path[0] === "body" ? path[0] : undefined),
        (field) => (field === "shortcut" ? "shortcut" : "tooLong"),
      ),
    (problem) => t(`problems.${problem}`),
  );
  return (
    <form id={formId} noValidate onSubmit={onSubmit(onSave)} className="flex flex-col gap-4">
      <TextField
        control={form.control}
        name="shortcut"
        label={t("shortcut")}
        hint={t("shortcutHint")}
        autoComplete="off"
        disabled={sending.isPending}
      />
      <TextField control={form.control} name="title" label={t("title")} disabled={sending.isPending} />
      <NoteField
        control={form.control}
        name="body"
        label={t("body")}
        hint={t("bodyHint")}
        disabled={sending.isPending}
      />
      <FormAlert sending={sending} problem={formProblem} />
    </form>
  );
}

export function QuickReplyDialog({
  existing,
  held,
  returnFocusTo,
}: {
  existing?: QuickReply;
  held?: OpenState;
  returnFocusTo?: ReturnFocusTo;
}) {
  const t = useTranslations("inbox.quickReplies");
  const dialog = useFormDialog(existing === undefined ? t("added") : t("saved"), undefined, held);
  const { create, update } = useSaveQuickReply();
  const sending = existing === undefined ? create : update;
  const onSave = (input: CreateQuickReplyInput) => {
    if (existing === undefined) create.mutate(input, { onSuccess: () => void dialog.onSuccess() });
    else update.mutate({ quickReplyId: existing.id, ...input }, { onSuccess: () => void dialog.onSuccess() });
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
      {(formId) => <QuickReplyForm formId={formId} existing={existing} onSave={onSave} sending={sending} />}
    </FormDialog>
  );
}
