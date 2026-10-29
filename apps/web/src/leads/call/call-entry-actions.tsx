"use client";

// Edit and Delete under a call on a lead's timeline (release 5): for who wrote it in its first day, and for a manager
// (leads:assign) at any time; the api decides again. Changes the subscription may refuse (useWriteAccess).
import { CALL_EDIT_HOURS, type CallOutcome } from "@travel-crm/contracts/crm";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/data/trpc";
import { useRefreshWork } from "@/data/use-refresh-work";
import { useNow } from "@/lib/use-now";
import { useHolds, useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { CallNoteDialog } from "./call-note-dialog";

const HOUR = 3_600_000;

export function CallEntryActions({
  leadId,
  call,
}: {
  leadId: string;
  call: { callId: string; outcome: CallOutcome; note: string | null; actorUserId: string | null; occurredAt: string };
}) {
  const t = useTranslations("leads.call");
  const tTimeline = useTranslations("leads.lead.timeline");
  const me = useMe();
  const manager = useHolds("leads:assign");
  const now = useNow();
  const write = useWriteAccess("change");
  const trpc = useTRPC();
  const refresh = useRefreshWork();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const hintId = useId();
  // The dialog closes in the request's own options, which outlive this row once the timeline loads again.
  const remove = useMutation(
    trpc.calls.remove.mutationOptions({
      onSuccess: async () => {
        await refresh();
        setDeleting(false);
      },
    }),
  );
  const recent = now.getTime() - new Date(call.occurredAt).getTime() < CALL_EDIT_HOURS * HOUR;
  const writer = call.actorUserId !== null && call.actorUserId === me.user.id;
  if (!manager && !(writer && recent)) return null;
  const outcome = t(`note.outcomes.${call.outcome}`);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        <Button
          ref={editButton}
          variant="ghost"
          aria-describedby={write.hint === null ? undefined : hintId}
          disabled={!write.allowed}
          aria-label={tTimeline("callEditNamed", { outcome })}
          onClick={() => {
            setEditing(true);
          }}
        >
          {t("edit")}
        </Button>
        <Button
          ref={deleteButton}
          variant="ghost"
          aria-describedby={write.hint === null ? undefined : hintId}
          disabled={!write.allowed}
          aria-label={tTimeline("callDeleteNamed", { outcome })}
          onClick={() => {
            setDeleting(true);
          }}
        >
          {t("delete.label")}
        </Button>
      </div>
      <WriteHint id={hintId} hint={write.hint} />
      <CallNoteDialog
        leadId={leadId}
        name=""
        held={{ open: editing, setOpen: setEditing }}
        existing={{ callId: call.callId, outcome: call.outcome, note: call.note }}
        returnFocusTo={editButton}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t("delete.title")}
        description={t("delete.description")}
        action={t("delete.label")}
        request={remove}
        onConfirm={() => {
          remove.mutate({ callId: call.callId });
        }}
        returnFocusTo={deleteButton}
      />
    </div>
  );
}
