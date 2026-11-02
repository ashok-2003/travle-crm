"use client";

// The failed emails a page at a time (emails.failed, data/use-cursor-pages.ts), newest first; one email as it was sent
// (emails.get); and sending one again (emails.resend), which refreshes both whatever its outcome.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCursorPages } from "@/data/use-cursor-pages";
import { useConsoleTRPC, useConsoleTRPCClient } from "../data/console-trpc";

const EMAILS_PER_PAGE = 25;

export function useFailedEmails() {
  const trpc = useConsoleTRPC();
  const client = useConsoleTRPCClient();
  return useCursorPages({
    queryKey: [...trpc.emails.failed.pathKey(), { limit: EMAILS_PER_PAGE }],
    page: (cursor) => client.emails.failed.query({ limit: EMAILS_PER_PAGE, ...(cursor === null ? {} : { cursor }) }),
    items: (page) => page.emails,
  });
}

export function useStoredEmail(emailId: string) {
  const trpc = useConsoleTRPC();
  return useQuery(trpc.emails.get.queryOptions({ id: emailId }));
}

/** Sends a failed email again. `onSent` closes the dialog, in the mutation's own options so it survives a close. */
export function useResendEmail(onSent: () => void) {
  const trpc = useConsoleTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.emails.resend.mutationOptions({
      onSuccess: () => {
        onSent();
      },
      onSettled: () =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: trpc.emails.failed.pathKey() }),
          queryClient.invalidateQueries({ queryKey: trpc.emails.get.pathKey() }),
        ]),
    }),
  );
}
