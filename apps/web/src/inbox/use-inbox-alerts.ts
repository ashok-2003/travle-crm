"use client";

// What the tab holding the live stream does when it says a customer wrote (inbox revamp spec, part 1 item 5), on any page of
// the app: if the member turned the sound or desktop notifications on, and the chat is theirs (inbox-alerts.ts) and not
// in front of them in any tab, a soft sound and "New message from <name>", which opens the chat. The chat's name and
// owner come from its header, the same read the chat itself uses.
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef } from "react";
import { useTRPC } from "@/data/trpc";
import { formatPhoneNumber } from "@/lib/format";
import { inboxRoute } from "@/lib/routes";
import { useMe } from "@/session/me-context";
import { alertIsOn, alertsMember, claimAlert, notificationPermission, showChatNotice } from "./inbox-alerts";

/**
 * `inFront` says whether a chat is the one the member is looking at, in this tab or another; `chime` sounds the chime,
 * from this tab or one the browser lets sound.
 */
export function useInboxAlerts(
  inFront: (conversationId: string) => boolean,
  chime: (conversationId: string) => void,
): (conversationId: string) => void {
  const t = useTranslations("inbox.alerts");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const me = useMe();
  const front = useRef({ inFront, chime });
  useEffect(() => {
    front.current = { inFront, chime };
  });
  return useCallback(
    (conversationId: string) => {
      const sound = alertIsOn(me.user.id, "sound");
      const desktop = alertIsOn(me.user.id, "desktop") && notificationPermission() === "granted";
      if ((!sound && !desktop) || front.current.inFront(conversationId)) return;
      void queryClient
        .query(trpc.inbox.conversation.queryOptions({ conversationId }))
        .then((header) => {
          if (!alertsMember(me, header) || !claimAlert(conversationId)) return;
          if (sound) front.current.chime(conversationId);
          if (!desktop) return;
          return showChatNotice(
            t("newMessageFrom", { name: header.name ?? formatPhoneNumber(header.phone) }),
            conversationId,
            () => {
              router.push(inboxRoute(conversationId));
            },
          );
        })
        // A chat that didn't load gives no alert; the list shows the message all the same.
        .catch(() => undefined);
    },
    [me, queryClient, router, t, trpc],
  );
}
