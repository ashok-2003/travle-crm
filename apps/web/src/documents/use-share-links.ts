"use client";

// A document's share links (shareLinks.*): the list, asked for afresh whenever it is shown (customers' opens arrive at
// any time), making a link and turning one off, each followed by the list again.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useTRPC } from "@/data/trpc";

/** What the documents screen shares: an issued document (apps/api/src/share-link-resolvers.ts opens it). */
export const sharedDocument = (documentId: string) => ({ recordType: "issued_document", recordId: documentId });

export function useShareLinks(documentId: string) {
  const trpc = useTRPC();
  return useQuery(trpc.shareLinks.list.queryOptions(sharedDocument(documentId), { staleTime: 0 }));
}

export function useCreateShareLink() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.shareLinks.create.mutationOptions({
      onSettled: () => queryClient.invalidateQueries({ queryKey: trpc.shareLinks.list.pathKey() }),
    }),
  );
}

export function useRevokeShareLink() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const t = useTranslations("documents.share");
  return useMutation(
    trpc.shareLinks.revoke.mutationOptions({
      onSuccess: () => {
        toast.success(t("revoked"));
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey: trpc.shareLinks.list.pathKey() }),
    }),
  );
}
