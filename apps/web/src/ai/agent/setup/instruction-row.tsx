"use client";

// One of the owner's instructions to the agent, as a row of the Custom instructions step: its words, Edit (a form in a
// dialog) and Remove (asked once more).
import { useMutation } from "@tanstack/react-query";
import { AGENT_INSTRUCTION_LENGTH, type AgentInstruction } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField } from "@/components/form-field";
import { FormAlert, FormDialog, useFormDialog, type Sending } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { ItemActions, ItemContent, ItemDescription } from "@/components/ui/item";
import { Textarea } from "@/components/ui/textarea";
import { useTRPC } from "@/data/trpc";
import { useRefreshInstructions } from "./use-setup-steps";

function EditForm({
  formId,
  instruction,
  save,
}: {
  formId: string;
  instruction: AgentInstruction;
  save: Sending<{ id: string; text: string }>;
}) {
  const t = useTranslations("aiAgent.setup.instructions");
  const [typed, setTyped] = useState(instruction.text);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const text = typed.trim();
        if (text === "") {
          setProblem(t("required"));
          return;
        }
        setProblem(undefined);
        save.mutate({ id: instruction.id, text });
      }}
    >
      <FormField label={t("text")} hint={t("hint", { max: AGENT_INSTRUCTION_LENGTH })}>
        {(links) => (
          <Textarea
            {...links}
            rows={3}
            maxLength={AGENT_INSTRUCTION_LENGTH}
            value={typed}
            disabled={save.isPending}
            onChange={(event) => {
              setTyped(event.target.value);
            }}
          />
        )}
      </FormField>
      <FormAlert sending={save} problem={problem} />
    </form>
  );
}

export function InstructionRow({
  instruction,
  number,
  writable,
  describedBy,
}: {
  instruction: AgentInstruction;
  /** Its place in the list, which names its buttons ("Edit instruction 2"). */
  number: number;
  writable: boolean;
  /** The subscription's hint, when a change is refused. */
  describedBy: string | undefined;
}) {
  const t = useTranslations("aiAgent.setup.instructions");
  const trpc = useTRPC();
  const refresh = useRefreshInstructions();
  const dialog = useFormDialog(t("saved"), refresh);
  const save = useMutation(trpc.ai.updateAgentInstruction.mutationOptions({ onSuccess: dialog.onSuccess }));
  const [removing, setRemoving] = useState(false);
  const removeButton = useRef<HTMLButtonElement>(null);
  const remove = useMutation(
    trpc.ai.removeAgentInstruction.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.success(t("removed"));
        setRemoving(false);
      },
    }),
  );
  return (
    <>
      <ItemContent>
        <ItemDescription className="line-clamp-none">{instruction.text}</ItemDescription>
      </ItemContent>
      <ItemActions>
        {writable ? (
          <FormDialog
            dialog={dialog}
            sending={save}
            trigger={{ label: t("edit"), accessibleLabel: t("editNamed", { number }) }}
            title={t("editTitle", { number })}
            description={t("editDescription")}
            submit={t("save")}
            submitting={t("saving")}
          >
            {(formId) => <EditForm formId={formId} instruction={instruction} save={save} />}
          </FormDialog>
        ) : (
          <Button variant="outline" disabled aria-label={t("editNamed", { number })} aria-describedby={describedBy}>
            {t("edit")}
          </Button>
        )}
        <Button
          ref={removeButton}
          variant="outline"
          disabled={!writable}
          aria-label={t("removeNamed", { number })}
          aria-describedby={describedBy}
          onClick={() => {
            setRemoving(true);
          }}
        >
          {t("remove")}
        </Button>
      </ItemActions>
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={t("removeTitle", { number })}
        description={t("removeDescription")}
        action={t("remove")}
        request={remove}
        returnFocusTo={removeButton}
        onConfirm={() => {
          remove.mutate({ id: instruction.id });
        }}
      />
    </>
  );
}
