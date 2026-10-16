"use client";

// A document's share links (spec 9.3): the links made so far, a new one, and a new link's whole address once.
import type { IssuedDocumentSummary } from "@travel-crm/contracts/documents";
import { useTranslations } from "next-intl";
import { ResponsiveDialog } from "@/organization/responsive-dialog";
import { CreateShareLinkForm } from "./create-share-link-form";
import { CreatedLink } from "./created-link";
import { ShareLinkList } from "./share-link-list";
import { useCreateShareLink } from "./use-share-links";

export function ShareLinksDialog({
  document,
  open,
  onOpenChange,
}: {
  document: IssuedDocumentSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("documents.share");
  const create = useCreateShareLink();
  const changeOpen = (next: boolean) => {
    // Open while a link is being made, so its whole address, shown once, is never missed.
    if (create.isPending) return;
    // The token is in the call's answer: let go of it when the dialog closes.
    if (!next) create.reset();
    onOpenChange(next);
  };
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={changeOpen}
      title={t("title", { number: document.number })}
      description={t("description")}
    >
      {create.data ? (
        <CreatedLink
          path={create.data.path}
          onDone={() => {
            create.reset();
          }}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <ShareLinkList documentId={document.id} />
          <CreateShareLinkForm document={document} create={create} />
        </div>
      )}
    </ResponsiveDialog>
  );
}
