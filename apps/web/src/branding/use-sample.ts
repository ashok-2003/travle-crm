"use client";

// Previewing the branding on a sample quotation: issue one (documents.issueSample), then ask for it again while the
// worker prepares its PDF, until it is ready or can never be made. Asking stops when it fails, for the screen to say
// so and offer to ask again, rather than saying "being prepared" for ever.
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";
import { documentState, PREPARING_POLL_MS } from "@/documents/document-state";

export function useSample() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const issue = useMutation(
    trpc.documents.issueSample.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.documents.list.pathKey() }),
    }),
  );
  const issued = issue.data;
  const sample = useQuery(
    trpc.documents.get.queryOptions(issued ? { documentId: issued.id } : skipToken, {
      refetchInterval: (query) =>
        query.state.status === "error" || (query.state.data && documentState(query.state.data) !== "preparing")
          ? false
          : PREPARING_POLL_MS,
      // A sample being prepared is this page's business only: never kept in the saved copy.
      meta: { persist: false },
    }),
  );
  return {
    issue,
    // The issued document is the answer until the first get comes back.
    sample: sample.data ?? issued,
    checkFailed: sample.isError,
    checkError: sample.error,
    checkAgain: () => void sample.refetch(),
  };
}
