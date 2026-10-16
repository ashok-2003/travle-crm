"use client";

// Has the bell ask again whenever a push arrives, on every signed-in page at every width: the layout renders it once.
import { useRefreshOnPush } from "@/notifications/bell/use-refresh-on-push";

export function RefreshOnPush() {
  useRefreshOnPush();
  return null;
}
