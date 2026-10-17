"use client";

// A document's share links (spec 9.3): the links made so far and a new one, sent from the footer; then the new link's
// whole address once, with Done in the footer to go back to the list.
import type { IssuedDocumentSummary } from "@travel-crm/contracts/documents";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import type { ReturnFocusTo } from "@/components/return-focus";
import { useWriteAccess } from "@/subscription/write-access";
import { CreateShareLinkForm, writeHintOf } from "./create-share-link-form";
import { CreatedLink } from "./created-link";
import { ShareLinkList } from "./share-link-list";
import { useCreateShareLink } from "./use-share-links";

export function ShareLinksDialog({
  document,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  document: IssuedDocumentSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The button that opened it, which takes the focus back when it closes. */
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("documents.share");
  const create = useCreateShareLink();
  const write = useWriteAccess();
  const formId = useId();
  return (
    <ResponsiveDialog
      returnFocusTo={returnFocusTo}
      open={open}
      onOpenChange={(next) => {
        // The token is in the call's answer: let go of it when the dialog closes.
        if (!next) create.reset();
        onOpenChange(next);
      }}
      // Open while a link is being made, so its whole address, shown once, is never missed.
      busy={create.isPending}
      title={t("title", { number: document.number })}
      description={t("description")}
      cancel={!create.data}
      footer={
        create.data ? (
          <Button
            onClick={() => {
              create.reset();
            }}
          >
            {t("done")}
          </Button>
        ) : (
          <Button
            type="submit"
            form={formId}
            disabled={!write.allowed || create.isPending}
            aria-describedby={write.hint === null ? undefined : writeHintOf(formId)}
          >
            {create.isPending ? t("creating") : t("create")}
          </Button>
        )
      }
    >
      {create.data ? (
        <CreatedLink path={create.data.path} />
      ) : (
        <div className="flex flex-col gap-6">
          <ShareLinkList documentId={document.id} />
          <CreateShareLinkForm formId={formId} document={document} create={create} />
        </div>
      )}
    </ResponsiveDialog>
  );
}
