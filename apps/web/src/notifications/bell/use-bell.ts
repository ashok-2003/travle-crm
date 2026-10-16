"use client";

// The bell's data (spec 9.4): the unread count, asked again every minute while the app is in view, and the person's
// notifications a page at a time, newest first. Marking read is a quick action (spec 11): the list and the count
// change at once, and go back with the reason if the api refuses.
import type { MarkReadInput, NotificationPage } from "@travel-crm/contracts/notifications";
import { useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { toast } from "sonner";
import { refusalOf } from "@/data/api-error";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { useCursorPages } from "@/data/use-cursor-pages";
import { useErrorMessage } from "@/lib/error-message";

const NOTIFICATIONS_PER_PAGE = 20;

/** The bell is how people hear of things, so its count doesn't wait for the window to regain focus. */
const COUNT_REFRESH_MS = 60_000;

/** Asked again every minute, unless the api refused the last ask (a cancelled or suspended organization): the same
 * answer would come every time. Coming back to the window asks again. */
export function countRefreshInterval(error: unknown): number | false {
  return refusalOf(error) === null ? COUNT_REFRESH_MS : false;
}

export function useUnreadCount() {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.notifications.unreadCount.queryOptions(),
    refetchInterval: (query) => countRefreshInterval(query.state.error),
  });
}

/** The list's key: under notifications.list, so invalidating that path refreshes it. */
function useListKey() {
  const trpc = useTRPC();
  return [...trpc.notifications.list.pathKey(), { limit: NOTIFICATIONS_PER_PAGE }];
}

/** Asked only once the bell opens; each page asks for those older than the last of the page before. */
export function useNotificationPages({ enabled }: { enabled: boolean }) {
  const client = useTRPCClient();
  return useCursorPages({
    queryKey: useListKey(),
    page: (cursor) =>
      client.notifications.list.query({
        limit: NOTIFICATIONS_PER_PAGE,
        ...(cursor === null ? {} : { cursor }),
      }),
    items: (page: NotificationPage) => page.notifications,
    enabled,
  });
}

/** Marks some (only unread ones are passed) or all of the person's notifications read. */
export function useMarkRead() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { apiError } = useErrorMessage();
  const listKey = useListKey();
  const countKey = trpc.notifications.unreadCount.queryKey();
  return useMutation(
    trpc.notifications.markRead.mutationOptions({
      onMutate: async (which: MarkReadInput) => {
        await Promise.all([
          queryClient.cancelQueries({ queryKey: listKey }),
          queryClient.cancelQueries({ queryKey: countKey }),
        ]);
        const before = {
          list: queryClient.getQueryData<InfiniteData<NotificationPage>>(listKey),
          count: queryClient.getQueryData(countKey),
        };
        const marked = (id: string) => "all" in which || which.notificationIds.includes(id);
        const readAt = new Date().toISOString();
        queryClient.setQueryData<InfiniteData<NotificationPage>>(listKey, (data) =>
          data === undefined
            ? data
            : {
                ...data,
                pages: data.pages.map((page) => ({
                  ...page,
                  notifications: page.notifications.map((notification) =>
                    notification.readAt === null && marked(notification.id)
                      ? { ...notification, readAt }
                      : notification,
                  ),
                })),
              },
        );
        queryClient.setQueryData(countKey, (count) =>
          count === undefined ? count : "all" in which ? 0 : Math.max(0, count - which.notificationIds.length),
        );
        return { before };
      },
      onError: (error, _which, onMutateResult) => {
        if (onMutateResult) {
          queryClient.setQueryData(listKey, onMutateResult.before.list);
          queryClient.setQueryData(countKey, onMutateResult.before.count);
        }
        toast.error(apiError(error), { duration: Infinity });
      },
      onSettled: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: trpc.notifications.list.pathKey() }),
          queryClient.invalidateQueries({ queryKey: countKey }),
        ]);
      },
    }),
  );
}
