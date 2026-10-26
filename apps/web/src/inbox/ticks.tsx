"use client";

// Our message's state as WhatsApp shows it, in the bubble and on the list's row: a clock while waiting, one tick sent,
// two delivered, and the two in the chat's read blue once read.
import type { WhatsappMessageStatus } from "@travel-crm/contracts/inbox";
import { CheckCheckIcon, CheckIcon, ClockIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export function Ticks({ status, className }: { status: WhatsappMessageStatus; className?: string }) {
  const t = useTranslations("inbox.chat.status");
  const size = cn("size-4 shrink-0", className);
  if (status === "queued" || status === "sending")
    return <ClockIcon aria-label={t(status)} className={size} role="img" />;
  if (status === "sent") return <CheckIcon aria-label={t("sent")} className={size} role="img" />;
  if (status !== "delivered" && status !== "read") return null;
  const read = status === "read";
  return (
    <CheckCheckIcon
      aria-label={t(read ? "read" : "delivered")}
      className={cn(size, read && "text-chat-tick-read")}
      role="img"
    />
  );
}
