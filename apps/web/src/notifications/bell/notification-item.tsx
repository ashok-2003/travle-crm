"use client";

// One notification in the bell. An unread one carries the People violet dot and, for screen readers, the word (never
// colour alone); then its title, its text and when, in the organization's zone. Its link is followed only when it is
// a path in this app: the api checks links, and the bell checks them again, so nothing in it leads off the app.
import type { NotificationSummary } from "@travel-crm/contracts/notifications";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
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
      <span
        aria-hidden="true"
        className={cn("mt-2 size-2 shrink-0 rounded-full", unread ? "bg-people" : "bg-transparent")}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {unread && <span className="sr-only">{t("unread")}</span>}
        <span className={cn("script-leading break-words", unread ? "font-semibold" : "font-medium")}>
          {notification.title}
        </span>
        <span className="script-leading text-label break-words text-muted-foreground">{notification.body}</span>
        <span className="text-caption text-muted-foreground">
          {t("when", { day: formatDay(createdAt, { timeZone }), time: formatTime(createdAt, { timeZone }) })}
        </span>
      </span>
    </>
  );

  return (
    <li className="flex items-start gap-1 px-2 py-1">
      {link === null ? (
        <div className="flex min-w-0 flex-1 gap-3 px-2 py-2">{content}</div>
      ) : (
        <Link
          href={link}
          onClick={onFollow}
          className="flex min-h-11 min-w-0 flex-1 gap-3 rounded-lg px-2 py-2 text-foreground hover:bg-accent"
        >
          {content}
        </Link>
      )}
      {link === null && unread && canMark && (
        <Button variant="ghost" className="shrink-0" onClick={onMark}>
          {t("markRead")}
        </Button>
      )}
    </li>
  );
}
