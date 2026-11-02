"use client";

// Counts the signed-in member's use of each page (the owner, 2026-10-28), for the platform console: the route with ids
// replaced by ":id" (never a search or a name: those are never in a route here), and the seconds it was on screen,
// sent when the page closes or the tab hides, and every two minutes while it is visible (a page open for a moment costs
// one call, not two). Nothing is sent while support is signed in as the member. Nothing shows.
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useTRPCClient } from "@/data/trpc";
import { useMe } from "@/session/me-context";

/** How often a visible page reports; it also reports when it closes or the tab hides, and never when it opens. */
export const PAGE_TRACK_BEAT_MS = 120_000;
const ID = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)$/i;

/** The route as counted: each id becomes ":id", and anything a route doesn't hold is dropped. */
export function routeOf(pathname: string): string {
  const route = pathname
    .split("/")
    .map((part) => (ID.test(part) ? ":id" : part.replace(/[^A-Za-z0-9_.-]/g, "")))
    .join("/")
    .slice(0, 200);
  return route === "" ? "/" : route;
}

export function PageTracker() {
  const client = useTRPCClient();
  const pathname = usePathname();
  // While support is signed in as a member, their use of the page is not the member's.
  const impersonating = useMe().impersonatedBy !== null;

  useEffect(() => {
    if (impersonating) return;
    const path = routeOf(pathname);
    const current = { id: null as string | null, seconds: 0, since: document.hidden ? null : Date.now() };
    // One report at a time, so a report sent while the last one's answer (the visit's id) is out still names the visit.
    let sending: Promise<void> = Promise.resolve();
    const report = () => {
      const now = Date.now();
      if (current.since !== null) {
        current.seconds += Math.round((now - current.since) / 1000);
        current.since = document.hidden ? null : now;
      }
      sending = sending.then(() =>
        client.usage.track
          .mutate({ path, seconds: current.seconds, ...(current.id === null ? {} : { visitId: current.id }) })
          .then((answer) => {
            current.id = answer.visitId ?? current.id;
          })
          .catch(() => undefined),
      );
    };
    const beat = window.setInterval(() => {
      if (!document.hidden) report();
    }, PAGE_TRACK_BEAT_MS);
    const onVisibility = () => {
      if (document.hidden) report();
      else current.since = Date.now();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(beat);
      document.removeEventListener("visibilitychange", onVisibility);
      report();
    };
  }, [pathname, client, impersonating]);

  return null;
}
