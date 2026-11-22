"use client";

// What the Inbox does when the live stream says a customer wrote (inbox revamp spec, part 1 item 5): if the member turned
// the sound or desktop notifications on, and the chat is theirs (inbox-alerts.ts) and not the one in front of them, a soft
// sound and "New message from <name>", which opens the chat. The chat's name and owner come from its header, the same read
// the chat itself uses.
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef } from "react";
import { useTRPC } from "@/data/trpc";
import { formatPhoneNumber } from "@/lib/format";
import { inboxRoute } from "@/lib/routes";
import { useMe } from "@/session/me-context";
import { alertIsOn, alertsMember, claimAlert, notificationPermission, playChime } from "./inbox-alerts";

/** Whether this chat is the one the member is looking at: open, in a tab that is in view and has the focus. */
const inFront = (conversationId: string, openId: string | null) =>
  conversationId === openId && document.visibilityState === "visible" && document.hasFocus();

export function useInboxAlerts(openId: string | null): (conversationId: string) => void {
  const t = useTranslations("inbox.alerts");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const me = useMe();
  const open = useRef(openId);
  useEffect(() => {
    open.current = openId;
  });
  return useCallback(
    (conversationId: string) => {
      const sound = alertIsOn("sound");
      const desktop = alertIsOn("desktop") && notificationPermission() === "granted";
      if ((!sound && !desktop) || inFront(conversationId, open.current)) return;
      void queryClient
        .query(trpc.inbox.conversation.queryOptions({ conversationId }))
        .then((header) => {
          if (!alertsMember(me, header) || !claimAlert(conversationId)) return;
          if (sound) playChime();
          if (!desktop) return;
          const notice = new Notification(
            t("newMessageFrom", { name: header.name ?? formatPhoneNumber(header.phone) }),
            {
              tag: `inbox-${conversationId}`,
            },
          );
          notice.onclick = () => {
            window.focus();
            router.push(inboxRoute(conversationId));
            notice.close();
          };
        })
        // A chat that didn't load gives no alert; the list shows the message all the same.
        .catch(() => undefined);
    },
    [me, queryClient, router, t, trpc],
  );
}
