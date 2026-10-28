"use client";

// Counts the signed-in member's use of each page (the owner, 2026-10-28), for the platform console: the route with ids
// replaced by ":id" (never a search or a name: those are never in a route here), and the seconds it was on screen,
// sent when the page opens and every half minute while it is visible. Nothing shows.
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useTRPCClient } from "@/data/trpc";

const BEAT_MS = 30_000;
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
  const visit = useRef<{ id: string | null; path: string; seconds: number; since: number | null }>({
    id: null,
    path: "",
    seconds: 0,
    since: null,
  });

  useEffect(() => {
    const path = routeOf(pathname);
    const current = { id: null as string | null, path, seconds: 0, since: document.hidden ? null : Date.now() };
    visit.current = current;
    const report = () => {
      const now = Date.now();
      if (current.since !== null) {
        current.seconds += Math.round((now - current.since) / 1000);
        current.since = document.hidden ? null : now;
      }
      client.usage.track
        .mutate({ path, seconds: current.seconds, ...(current.id === null ? {} : { visitId: current.id }) })
        .then((answer) => {
          current.id = answer.visitId ?? current.id;
        })
        .catch(() => undefined);
    };
    report();
    const beat = window.setInterval(() => {
      if (!document.hidden) report();
    }, BEAT_MS);
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
  }, [pathname, client]);

  return null;
}
