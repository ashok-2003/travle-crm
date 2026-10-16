"use client";

// The bell asks again the moment a push arrives, which the service worker tells the app's open pages
// (push/push-message.ts), rather than at its next minute.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTRPC } from "@/data/trpc";
import { isPushArrived } from "../push/push-message";

export function useRefreshOnPush(): void {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const workers = navigator.serviceWorker;
    const onMessage = (event: MessageEvent<unknown>) => {
      if (isPushArrived(event.data)) void queryClient.invalidateQueries({ queryKey: trpc.notifications.pathKey() });
    };
    workers.addEventListener("message", onMessage);
    return () => {
      workers.removeEventListener("message", onMessage);
    };
  }, [trpc, queryClient]);
}
