"use client";

// The last step of every sign-in: forget whatever an earlier session left on this device, then open the app with a
// full page load, so nothing from before survives in memory either.
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { wipeLocalData } from "@/data/session";

export function useFinishSignIn(): (next: string) => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(
    async (next) => {
      await wipeLocalData(queryClient);
      window.location.assign(next);
    },
    [queryClient],
  );
}
