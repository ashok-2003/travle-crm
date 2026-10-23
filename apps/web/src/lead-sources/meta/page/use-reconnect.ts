"use client";

// Reconnect: the same Facebook login as connecting, for a Page that needs it. The person leaves for Facebook's dialog and
// comes back to the callback page, which finishes it inside the one call and sends them to the Page's page.
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";
import { loadPage } from "@/lib/navigate";

export function useReconnect() {
  const trpc = useTRPC();
  return useMutation(
    trpc.metaLeads.reconnect.mutationOptions({
      onSuccess: ({ authorizeUrl }) => {
        loadPage(authorizeUrl);
      },
    }),
  );
}
