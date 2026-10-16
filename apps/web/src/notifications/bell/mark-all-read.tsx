"use client";

// "Mark all read", in the bell's title row: only while something is unread, and not for support impersonating the
// person, who may read their notifications but not mark them.
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useMe } from "@/session/me-context";
import { useMarkRead, useUnreadCount } from "./use-bell";

export function MarkAllRead() {
  const t = useTranslations("notifications.bell");
  const impersonated = useMe().impersonatedBy !== null;
  const unread = useUnreadCount().data ?? 0;
  const markRead = useMarkRead();
  if (impersonated || unread === 0) return null;
  return (
    <Button
      variant="ghost"
      className="shrink-0"
      onClick={() => {
        markRead.mutate({ all: true });
      }}
    >
      {t("markAllRead")}
    </Button>
  );
}
