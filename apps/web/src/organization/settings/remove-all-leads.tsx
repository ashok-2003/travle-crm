"use client";

// Settings' Remove every lead (the owner, 2026-11-01): one button, one confirmation, and every lead of the agency is
// removed but those with a quote or a booking. An Owner alone sees it; the api refuses everyone else too.
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/data/trpc";
import { useRefreshWork } from "@/data/use-refresh-work";
import { useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";

export function RemoveAllLeads() {
  const t = useTranslations("settings.removeAllLeads");
  const me = useMe();
  const trpc = useTRPC();
  const refresh = useRefreshWork();
  const write = useWriteAccess("change");
  const [asking, setAsking] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const hintId = useId();
  const remove = useMutation(
    trpc.leads.removeAll.mutationOptions({
      onSuccess: async ({ removed, kept }) => {
        setAsking(false);
        await refresh();
        toast.success(kept === 0 ? t("done", { removed }) : t("doneKept", { removed, kept }));
      },
    }),
  );
  if (!me.member.role.isOwner) return null;
  return (
    <section aria-labelledby="remove-all-leads-heading" className="flex flex-col gap-3">
      <h2 id="remove-all-leads-heading" className="text-section font-semibold">
        {t("heading")}
      </h2>
      <p className="text-muted-foreground">{t("description")}</p>
      <div className="flex flex-col items-start gap-1">
        <Button
          ref={opener}
          variant="destructive"
          disabled={!write.allowed}
          aria-describedby={write.hint === null ? undefined : hintId}
          onClick={() => {
            setAsking(true);
          }}
        >
          {t("button")}
        </Button>
        <WriteHint id={hintId} hint={write.hint} visible />
      </div>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        returnFocusTo={opener}
        title={t("title")}
        description={t("confirmDescription")}
        action={t("confirm")}
        request={remove}
        onConfirm={() => {
          remove.mutate();
        }}
      />
    </section>
  );
}
