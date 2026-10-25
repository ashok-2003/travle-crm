"use client";

// The chat's messages waiting to be sent later (sales inbox spec 6), above the reply box: when each goes and its first
// words, with Cancel; one that could not go (the 24-hour window had closed) says so.
import { ClockIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { formatDayTime } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { useSchedule, useScheduled } from "./use-sales-inbox";

export function ScheduledList({ conversationId }: { conversationId: string }) {
  const t = useTranslations("inbox.chat.scheduled");
  const { timeZone } = useMe().organization;
  const access = useWriteAccess("change");
  const scheduled = useScheduled(conversationId);
  const { cancel } = useSchedule();
  const items = scheduled.data ?? [];
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1" aria-label={t("label")}>
      {items.map((item) => (
        <li key={item.id}>
          <Item variant="muted" size="sm" className="bg-background py-1.5">
            <ItemMedia>
              <ClockIcon aria-hidden="true" className="size-4 text-primary" />
            </ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle className="text-caption">
                {item.status === "failed"
                  ? t("failed")
                  : t("goesAt", { when: formatDayTime(new Date(item.sendAt), { timeZone }) })}
              </ItemTitle>
              <ItemDescription className="line-clamp-1" dir="auto">
                {item.body}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("cancel")}
                disabled={!access.allowed || cancel.isPending}
                onClick={() => {
                  cancel.mutate({ scheduledId: item.id });
                }}
              >
                <XIcon aria-hidden="true" />
              </Button>
            </ItemActions>
          </Item>
        </li>
      ))}
    </ul>
  );
}
