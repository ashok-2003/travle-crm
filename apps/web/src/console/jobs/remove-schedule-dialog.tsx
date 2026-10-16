"use client";

// Removing a schedule, asked once more: it is for a job the code no longer has, and one the worker or the console
// still registers would only be back at its next start. The api refuses the console's own (SCHEDULE_IS_THE_CONSOLES).
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useRemoveSchedule } from "./use-schedules";

export function RemoveScheduleDialog({
  queue,
  open,
  onOpenChange,
}: {
  queue: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("consolePlatform.schedules");
  const remove = useRemoveSchedule(() => {
    onOpenChange(false);
  });
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("removeTitle", { queue })}
      description={t("removeDescription")}
      action={t("removeConfirm")}
      request={remove}
      onConfirm={() => {
        remove.mutate({ queue });
      }}
    />
  );
}
