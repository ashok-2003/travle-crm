"use client";

// The person's notifications inside the bell, newest first, a page at a time (spec 9.4), with honest loading, empty
// and failed states (DESIGN.md), "Mark all read" and older ones on request. Following an unread one's link marks it
// read. Support impersonating the person reads them but can't mark them read: the api refuses, as reading is the
// person's own.
import { BellIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Delayed } from "@/components/delayed";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useMe } from "@/session/me-context";
import { NotificationItem } from "./notification-item";
import { useMarkRead, useNotificationPages, useUnreadCount } from "./use-bell";

export function NotificationList({ open, onFollow }: { open: boolean; onFollow: () => void }) {
  const t = useTranslations("notifications.bell");
  const tCommon = useTranslations("common");
  const me = useMe();
  const pages = useNotificationPages({ enabled: open });
  const unread = useUnreadCount().data ?? 0;
  const markRead = useMarkRead();
  const canMark = me.impersonatedBy === null;
  const { notifications } = pages;

  if (notifications === undefined) {
    return pages.isError ? (
      <ErrorState message={t("loadFailed")} retryLabel={tCommon("tryAgain")} onRetry={() => void pages.refetch()} />
    ) : (
      <Delayed>
        <div role="status" aria-busy="true" aria-label={t("loading")} className="flex flex-col gap-2 p-4">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-14 w-full" />
          ))}
        </div>
      </Delayed>
    );
  }
  if (notifications.length === 0) return <EmptyState icon={BellIcon} message={t("empty")} />;

  return (
    <div className="flex flex-col gap-1 pb-3">
      {canMark ? (
        unread > 0 && (
          <Button
            variant="ghost"
            className="mr-2 self-end"
            onClick={() => {
              markRead.mutate({ all: true });
            }}
          >
            {t("markAllRead")}
          </Button>
        )
      ) : (
        <p className="px-4 py-2 text-label text-muted-foreground">{t("impersonating", { name: me.user.name })}</p>
      )}
      <ul className="flex flex-col divide-y">
        {notifications.map((notification) => {
          const mark = () => {
            markRead.mutate({ notificationIds: [notification.id] });
          };
          return (
            <NotificationItem
              key={notification.id}
              notification={notification}
              canMark={canMark}
              onMark={mark}
              onFollow={() => {
                if (canMark && notification.readAt === null) mark();
                onFollow();
              }}
            />
          );
        })}
      </ul>
      {pages.hasNextPage && (
        <Button
          variant="outline"
          className="self-center"
          disabled={pages.isFetchingNextPage}
          onClick={() => void pages.fetchNextPage()}
        >
          {pages.isFetchingNextPage && <Spinner />}
          {pages.isFetchingNextPage ? t("loadingMore") : t("showMore")}
        </Button>
      )}
    </div>
  );
}
