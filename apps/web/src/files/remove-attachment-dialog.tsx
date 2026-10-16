"use client";

// Removing a file: asked once more, because it goes for everyone. Its bytes stay in storage until the platform's
// purge, so it still counts toward the plan's storage (ADR 0011), and the dialog says so.
import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRemoveAttachment, type AttachmentRecord } from "./use-attachments";

export function RemoveAttachmentDialog({
  record,
  attachmentId,
  name,
  open,
  onOpenChange,
}: {
  record: AttachmentRecord;
  attachmentId: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("business.attachments");
  const tCommon = useTranslations("common");
  const remove = useRemoveAttachment(record, name);
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("removeTitle", { name })}</AlertDialogTitle>
          <AlertDialogDescription>{t("removeDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            // The final step of a destructive action is the one place red fills a button (DESIGN.md section 6).
            className="bg-status-bad-ink text-on-action hover:bg-status-bad-ink/90"
            disabled={remove.isPending}
            onClick={(event) => {
              // Stay open until the api answers, so the button can't be pressed twice.
              event.preventDefault();
              remove.mutate(
                { ...record, attachmentId },
                {
                  onSuccess: () => {
                    onOpenChange(false);
                  },
                },
              );
            }}
          >
            {t("remove")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
