"use client";

// Change the link (W5): asks once, naming what stops. It takes a door away from visitors, so it stays open while the
// subscription is read-only; the new link replaces the old one on the page when the api answers.
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { ReturnFocusTo } from "@/components/return-focus";
import { useChangeLink } from "./use-website-form";

export function ChangeLinkDialog({
  open,
  onOpenChange,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("websiteFormSettings.share.changeDialog");
  const change = useChangeLink(() => {
    onOpenChange(false);
  });
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      title={t("title")}
      description={t("description")}
      action={t("action")}
      request={change}
      onConfirm={() => {
        change.mutate();
      }}
    />
  );
}
