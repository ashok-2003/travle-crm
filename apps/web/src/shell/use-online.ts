"use client";

// Whether the browser thinks it has a connection, for the offline banner (DESIGN.md: a persistent banner offline).
import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    // While the page renders on the server there is no browser to ask: assume online.
    () => true,
  );
}
