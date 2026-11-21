"use client";

// Add a note, at the top of a lead's timeline (spec 3.4): one line until it is used (the lead page's revamp, 2026-11-21),
// then a few lines with its Add note button, until it is left empty. Checked by the api's schema (addNoteInput) before
// it is sent, the box held meanwhile; saved, the box empties, takes the focus back and the note shows first. A change,
// so it is off while the subscription refuses changes, and says why; a refusal shows its sentence. Its form is `ref`,
// for the phone's Note button (LeadActionBar), which brings the box into view and into use. On the lead's page an unsent
// note is kept for the tab (`keepDraft`), as the inbox keeps a reply's.
import { addNoteInput, type AddNoteInput } from "@travel-crm/contracts/crm";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState, type Ref } from "react";
import { useWatch } from "react-hook-form";
import { toast } from "sonner";
import { checked } from "@/components/forms/checked";
import { FormAlert } from "@/components/forms/form-dialog";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTRPC } from "@/data/trpc";
import { keepTabValue, readTabValue } from "@/lib/tab-storage";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { NoteField } from "../form/note-field";

/** Where the tab keeps a lead's unsent note (lib/tab-storage.ts, wiped at sign-out with the rest). */
const draftKey = (leadId: string) => `lead-note.${leadId}`;

export function NoteComposer({
  leadId,
  keepDraft = false,
  ref,
}: {
  leadId: string;
  /** Keep what is typed, unsent, for the tab: the lead's page, whose two layouts each have a box of their own. */
  keepDraft?: boolean;
  ref?: Ref<HTMLFormElement>;
}) {
  const t = useTranslations("leads.lead.timeline");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const write = useWriteAccess("change");
  const hintId = useId();
  const [inUse, setInUse] = useState(false);
  const [draft] = useState(() => (keepDraft ? (readTabValue(draftKey(leadId)) ?? "") : ""));
  const { form, onSubmit, formProblem } = useCheckedForm<{ body: string }, AddNoteInput, "required" | "tooLong">(
    { body: draft },
    (values) =>
      checked(
        addNoteInput.safeParse({ leadId, body: values.body }),
        values,
        () => "body",
        () => "tooLong",
      ),
    (problem) => t(`problems.${problem}`),
  );
  const body = useWatch({ control: form.control, name: "body" });
  // Typed and not yet sent, it outlives this box (a screen crossing 1280px swaps the page's layout); sent, it goes.
  useEffect(() => {
    if (keepDraft) keepTabValue(draftKey(leadId), body);
  }, [keepDraft, leadId, body]);
  const add = useMutation(
    trpc.leads.addNote.mutationOptions({
      onSuccess: async () => {
        form.reset({ body: "" });
        await queryClient.invalidateQueries({ queryKey: trpc.leads.timeline.pathKey() });
        toast.success(t("noteAdded"));
      },
    }),
  );
  // Held while sending, the box lost the focus: give it back once a note is saved and the box is open again (this
  // effect runs after the render that opened it), for the next note.
  useEffect(() => {
    if (add.isSuccess) form.setFocus("body");
  }, [add.isSuccess, form]);
  const open =
    inUse || body !== "" || add.isPending || formProblem !== undefined || form.formState.errors.body !== undefined;
  return (
    <form
      ref={ref}
      noValidate
      onSubmit={onSubmit(add.mutate)}
      className="flex flex-col gap-3"
      onFocus={() => {
        setInUse(true);
      }}
      onBlur={(event) => {
        // Still in use while the focus moves within it, from the box to its button.
        if (!event.currentTarget.contains(event.relatedTarget)) setInUse(false);
      }}
    >
      {/* Held while sending, so nothing typed meanwhile is lost when the box empties on success. */}
      <NoteField
        control={form.control}
        name="body"
        label={t("addNote")}
        disabled={add.isPending}
        {...(open ? {} : { rows: 1, className: "min-h-11" })}
      />
      <FormAlert sending={add} problem={formProblem} />
      {(open || write.hint !== null) && (
        <div className="flex flex-col gap-1">
          {open && (
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
          )}
          <WriteHint id={hintId} hint={write.hint} />
        </div>
      )}
    </form>
  );
}
