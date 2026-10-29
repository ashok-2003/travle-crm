"use client";

// A message's journey (audit 9): when it was sent, delivered and read, in the organization's zone. The customer's message shows
// the time it arrived.
import type { ChatMessage } from "@travel-crm/contracts/inbox";
import { useTranslations } from "next-intl";
import { Details } from "@/components/details";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import type { ReturnFocusTo } from "@/components/return-focus";
import { formatDayTime } from "@/lib/format";
import { useMe } from "@/session/me-context";

export function MessageInfo({
  message,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  message: ChatMessage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo?: ReturnFocusTo;
}) {
  const t = useTranslations("inbox.chat.info");
  const { timeZone } = useMe().organization;
  const when = (instant: string | null) =>
    instant === null ? t("notYet") : formatDayTime(new Date(instant), { timeZone });
  const rows =
    message.direction === "in"
      ? [{ label: t("received"), value: when(message.occurredAt) }]
      : [
          { label: t("queued"), value: when(message.occurredAt) },
          { label: t("sent"), value: when(message.sentAt) },
          { label: t("delivered"), value: when(message.deliveredAt) },
          { label: t("read"), value: when(message.readAt) },
        ];
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={t("description")}
      returnFocusTo={returnFocusTo}
    >
      <Details rows={rows} />
    </ResponsiveDialog>
  );
}
