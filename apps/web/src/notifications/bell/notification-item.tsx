"use client";

// One notification in the bell. An unread one carries the People violet dot and, for screen readers, the word (never
// colour alone); then its title, its text and when, in the organization's zone. Its link is followed only when it is
// a path in this app: the api checks links, and the bell checks them again, so nothing in it leads off the app.
import type { NotificationSummary } from "@travel-crm/contracts/notifications";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { formatDay, formatTime } from "@/lib/format";
import { isAppPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useMe } from "@/session/me-context";

export function NotificationItem({
  notification,
  canMark,
  onMark,
  onFollow,
}: {
  notification: NotificationSummary;
  /** False while support is impersonating the person: only they mark their notifications read. */
  canMark: boolean;
  onMark: () => void;
  /** The link is being followed. */
  onFollow: () => void;
}) {
  const t = useTranslations("notifications.bell");
  const { timeZone } = useMe().organization;
  const createdAt = new Date(notification.createdAt);
  const unread = notification.readAt === null;
  const link = notification.link !== null && isAppPath(notification.link) ? notification.link : null;

  const content = (
    <>
      <ItemMedia>
        <span
          aria-hidden="true"
          className={cn("mt-1.5 size-2 rounded-full", unread ? "bg-people" : "bg-transparent")}
        />
      </ItemMedia>
      <ItemContent className="min-w-0 gap-0.5">
        {unread && <span className="sr-only">{t("unread")}</span>}
        <ItemTitle className={cn("script-leading wrap-anywhere", unread && "font-semibold")}>
          {notification.title}
        </ItemTitle>
        <ItemDescription className="script-leading wrap-anywhere">{notification.body}</ItemDescription>
        <span className="text-caption text-muted-foreground">
          {t("when", { day: formatDay(createdAt, { timeZone }), time: formatTime(createdAt, { timeZone }) })}
        </span>
      </ItemContent>
    </>
  );

  if (link !== null) {
    return (
      <div role="listitem">
        <Item size="sm" asChild>
          <Link href={link} onClick={onFollow}>
            {content}
          </Link>
        </Item>
      </div>
    );
  }
  return (
    <Item size="sm" role="listitem">
      {content}
      {unread && canMark && (
        <ItemActions>
          <Button variant="ghost" onClick={onMark}>
            {t("markRead")}
          </Button>
        </ItemActions>
      )}
    </Item>
  );
}
