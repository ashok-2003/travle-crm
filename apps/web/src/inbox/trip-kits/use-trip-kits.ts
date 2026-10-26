"use client";

// Trip details' reads and changes (sales inbox, trip details): the agency's trips, adding, changing and deleting one, its
// files (three steps: ask where to put the file, put it straight into storage, name it), and sending a trip to a chat.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { uploadFile } from "@/files/upload";
import { useInvalidate } from "../use-sales-inbox";

export function useTripKits() {
  const trpc = useTRPC();
  return useQuery({ ...trpc.tripKits.list.queryOptions(), staleTime: 60_000 });
}

function useRefreshTripKits() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: trpc.tripKits.list.pathKey() });
}

export function useSaveTripKit() {
  const trpc = useTRPC();
  const refresh = useRefreshTripKits();
  return {
    create: useMutation(trpc.tripKits.create.mutationOptions({ onSuccess: refresh })),
    update: useMutation(trpc.tripKits.update.mutationOptions({ onSuccess: refresh })),
    remove: useMutation(trpc.tripKits.delete.mutationOptions({ onSuccess: refresh })),
  };
}

/** Adds files to a trip one after another, and removes one. */
export function useTripKitFiles(tripKitId: string) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const refresh = useRefreshTripKits();
  const add = useMutation({
    mutationFn: async (files: readonly File[]) => {
      for (const file of files) {
        const slot = await client.tripKits.requestUpload.mutate({
          tripKitId,
          fileName: file.name,
          contentType: file.type as never,
          sizeBytes: file.size,
        });
        await uploadFile(slot.upload, file);
        await client.tripKits.confirmUpload.mutate({ tripKitId, attachmentId: slot.attachmentId });
      }
    },
    // A file that failed halfway leaves the ones before it added: the list shows them.
    onSettled: refresh,
  });
  const remove = useMutation(trpc.tripKits.removeFile.mutationOptions({ onSuccess: refresh }));
  return { add, remove };
}

/** Sends a trip to a chat; the token is kept until it goes, so a double tap is one send. */
export function useSendTripKit(conversationId: string) {
  const trpc = useTRPC();
  const invalidate = useInvalidate();
  const [token, setToken] = useState(() => crypto.randomUUID());
  const send = useMutation(
    trpc.tripKits.send.mutationOptions({
      onSuccess: async () => {
        setToken(crypto.randomUUID());
        await Promise.all([invalidate("messages"), invalidate("chats"), invalidate("chat")]);
      },
    }),
  );
  return {
    send,
    sendKit: (tripKitId: string, options: { onSuccess: (queued: number) => void }) => {
      send.mutate(
        { conversationId, tripKitId, clientToken: token },
        {
          onSuccess: (sent) => {
            options.onSuccess(sent.queued);
          },
        },
      );
    },
  };
}
