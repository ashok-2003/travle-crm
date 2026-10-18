"use client";

// Whether the screen matches a media query ("(min-width: 768px)", "(hover: hover)"), kept up to date as it changes,
// for parts that differ in kind between screens: a sheet or a dialog, a tooltip or a popover.
import { useCallback, useSyncExternalStore } from "react";

/** Phones first: false until the browser says otherwise, and while the page renders on the server. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => {
        list.removeEventListener("change", onChange);
      };
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
