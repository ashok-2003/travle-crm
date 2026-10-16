"use client";

// The person's notifications inside the bell, newest first, a page at a time (spec 9.4), with honest loading, empty
// and failed states (DESIGN.md), "Mark all read" and older ones on request. Following an unread one's link marks it
// read. Support impersonating the person reads them but can't mark them read: the api refuses, as reading is the
// person's own.
import { BellIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ShowMoreButton } from "@/components/show-more-button";
import { ItemGroup, ItemSeparator } from "@/components/ui/item";
import { LoadingRows } from "@/components/loading-rows";
import { useMe } from "@/session/me-context";
import { NotificationItem } from "./notification-item";
import { useMarkRead, useNotificationPages } from "./use-bell";

export function NotificationList({ open, onFollow }: { open: boolean; onFollow: () => void }) {
  const t = useTranslations("notifications.bell");
  const tCommon = useTranslations("common");
  const me = useMe();
  const pages = useNotificationPages({ enabled: open });
  const markRead = useMarkRead();
  const canMark = me.impersonatedBy === null;
  const { items: notifications } = pages;

  if (notifications === undefined) {
    return pages.isError ? (
      <ErrorState
        message={t("loadFailed")}
        error={pages.error}
        retryLabel={tCommon("tryAgain")}
        onRetry={() => void pages.refetch()}
      />
    ) : (
      <LoadingRows rows={3} label={t("loading")} />
    );
  }
  if (notifications.length === 0) return <EmptyState icon={BellIcon} message={t("empty")} />;

  return (
    <div className="flex flex-col gap-1 pb-3">
      {!canMark && (
        <p className="px-4 py-2 text-label text-muted-foreground">{t("impersonating", { name: me.user.name })}</p>
      )}
      <ItemGroup>
        {notifications.map((notification, index) => {
          const mark = () => {
            markRead.mutate({ notificationIds: [notification.id] });
          };
          return (
            <Fragment key={notification.id}>
              {index > 0 && <ItemSeparator />}
              <NotificationItem
                notification={notification}
                canMark={canMark}
                onMark={mark}
                onFollow={() => {
                  if (canMark && notification.readAt === null) mark();
                  onFollow();
                }}
              />
            </Fragment>
          );
        })}
      </ItemGroup>
      <ShowMoreButton pages={pages} label={t("showMore")} />
    </div>
  );
}
