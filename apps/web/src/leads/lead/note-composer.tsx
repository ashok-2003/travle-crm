"use client";

// Add a note, at the top of a lead's timeline (spec 3.4): a few lines, checked by the api's schema (addNoteInput)
// before they are sent; saved, the box empties and the note shows first. A change, so it is off while the subscription
// refuses changes, and says why; a refusal shows its sentence.
import { addNoteInput, type AddNoteInput } from "@travel-crm/contracts/crm";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { toast } from "sonner";
import { checked } from "@/components/forms/checked";
import { FormAlert } from "@/components/forms/form-dialog";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTRPC } from "@/data/trpc";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { NoteField } from "../form/note-field";

export function NoteComposer({ leadId }: { leadId: string }) {
  const t = useTranslations("leads.lead.timeline");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const write = useWriteAccess("change");
  const hintId = useId();
  const { form, onSubmit, formProblem } = useCheckedForm<{ body: string }, AddNoteInput, "required" | "tooLong">(
    { body: "" },
    (values) =>
      checked(
        addNoteInput.safeParse({ leadId, body: values.body }),
        values,
        () => "body",
        () => "tooLong",
      ),
    (problem) => t(`problems.${problem}`),
  );
  const add = useMutation(
    trpc.leads.addNote.mutationOptions({
      onSuccess: async () => {
        form.reset({ body: "" });
        await queryClient.invalidateQueries({ queryKey: trpc.leads.timeline.pathKey() });
        toast.success(t("noteAdded"));
      },
    }),
  );
  return (
    <form noValidate onSubmit={onSubmit(add.mutate)} className="flex flex-col gap-3">
      <NoteField control={form.control} name="body" label={t("addNote")} />
      <FormAlert sending={add} problem={formProblem} />
      <div className="flex flex-col gap-1">
        <Button
          type="submit"
          variant="outline"
          className="self-start"
          aria-describedby={write.hint === null ? undefined : hintId}
          disabled={add.isPending || !write.allowed}
        >
          {add.isPending && <Spinner />}
          {t("saveNote")}
        </Button>
        <WriteHint id={hintId} hint={write.hint} />
      </div>
    </form>
  );
}
