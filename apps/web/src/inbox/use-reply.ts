"use client";

// Sending from the composer (spec 4.4): a text reply is one call; a file is three steps (ask where to put it, put it straight
// into storage, name it), then the worker sends. The browser's token for a send is kept until it succeeds, so a double tap or a
// retried request is one message; both flows load the inbox again when done, so the message shows at once as queued.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { uploadFile } from "@/files/upload";
import { useTRPC, useTRPCClient } from "@/data/trpc";

/** `onSent` runs once a message is queued: the composer empties then, never before, so a failed try keeps the words. */
export function useReply(conversationId: string, onSent: () => void) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const [token, setToken] = useState(() => crypto.randomUUID());
  const settled = async () => {
    setToken(crypto.randomUUID());
    onSent();
    await queryClient.invalidateQueries({ queryKey: trpc.inbox.pathKey() });
  };
  const sendText = useMutation(trpc.inbox.send.mutationOptions({ onSuccess: settled }));
  const sendFile = useMutation({
    mutationFn: async ({ file, caption }: { file: File; caption: string | undefined }) => {
      const slot = await client.inbox.requestMediaUpload.mutate({
        conversationId,
        fileName: file.name,
        contentType: file.type as never,
        sizeBytes: file.size,
      });
      await uploadFile(slot.upload, file);
      return client.inbox.sendMedia.mutate({
        conversationId,
        messageId: slot.messageId,
        attachmentId: slot.attachmentId,
        clientToken: token,
        ...(caption === undefined ? {} : { caption }),
      });
    },
    onSuccess: settled,
  });
  return {
    sendText: (text: string) => {
      sendText.mutate({ conversationId, clientToken: token, text });
    },
    sendFile: (file: File, caption: string | undefined) => {
      sendFile.mutate({ file, caption });
    },
    pending: sendText.isPending || sendFile.isPending,
    error: sendText.error ?? sendFile.error,
  };
}
