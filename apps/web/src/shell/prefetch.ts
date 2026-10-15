"use client";

// Loading a destination's data before it opens (spec 11: prefetch of likely next screens). When a navigation link
// is pointed at, focused or touched, the screen's first query starts, so it usually opens with its data. The screens
// ask for the same queries, so they find them in the cache.
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTRPC } from "@/data/trpc";
import type { NavigationItem } from "./navigation";

export function usePrefetchDestination(): (key: NavigationItem["key"]) => void {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useCallback(
    (key) => {
      // A failed prefetch is ignored: the screen asks again when it opens, and shows the failure then.
      const ignore = () => undefined;
      if (key === "staff") queryClient.query(trpc.staff.list.queryOptions()).catch(ignore);
      else if (key === "roles") queryClient.query(trpc.roles.list.queryOptions()).catch(ignore);
      else if (key === "settings") queryClient.query(trpc.settings.get.queryOptions()).catch(ignore);
    },
    [trpc, queryClient],
  );
}

/** The link props that start a prefetch. */
export function prefetchHandlers(prefetch: () => void) {
  return { onPointerEnter: prefetch, onFocus: prefetch, onTouchStart: prefetch };
}
