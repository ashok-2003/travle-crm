"use client";

// Unblock on one blocked contact (spec 3.6, R33): asks first (ConfirmDialog, which holds while the request is out),
// then takes it off the list, which loads again with the rest of the work (the new-lead form's warning about it). A
// change the subscription may refuse: then the button is off and says why (ADR 0021).
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/data/trpc";
import { useRefreshWork } from "@/data/use-refresh-work";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";

export function UnblockContact({ contactId, shown }: { contactId: string; shown: string }) {
  const t = useTranslations("settings.blockedContacts.unblock");
  const trpc = useTRPC();
  const refresh = useRefreshWork();
  const write = useWriteAccess();
  const hintId = useId();
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const unblock = useMutation(
    trpc.blockedContacts.unblock.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.success(t("done"));
        setOpen(false);
      },
    }),
  );
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        ref={opener}
        variant="outline"
        aria-label={t("actionFor", { value: shown })}
        aria-describedby={write.hint === null ? undefined : hintId}
        disabled={!write.allowed}
        onClick={() => {
          setOpen(true);
        }}
      >
        {t("action")}
      </Button>
      <WriteHint id={hintId} hint={write.hint} />
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        returnFocusTo={opener}
        title={t("title", { value: shown })}
        description={t("description")}
        action={t("action")}
        request={unblock}
        onConfirm={() => {
          unblock.mutate({ blockedContactId: contactId });
        }}
      />
    </div>
  );
}
