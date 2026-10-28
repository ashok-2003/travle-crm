"use client";

// Sending from the composer (spec 4.4): a text reply is one call; a file is three steps (ask where to put it, put it straight
// into storage with its progress shown and a way to stop, name it), then the worker sends. The browser's token for a send is
// kept until it succeeds, so a double tap or a retried request is one message; both flows load the inbox again when done, so
// the message shows at once as queued. While a file goes up, the chat shows it as a bubble of its own (pending-sends.ts).
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { uploadFile } from "@/files/upload";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { endPendingSend, progressOfPendingSend, startPendingSend } from "./pending-sends";
import { useInvalidate } from "./use-sales-inbox";

const wasStopped = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

/** `onSent` runs once a message is queued: the composer empties then, never before, so a failed try keeps the words. */
export function useReply(conversationId: string, onSent: () => void) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const invalidate = useInvalidate();
  const [token, setToken] = useState(() => crypto.randomUUID());
  const stop = useRef<AbortController | null>(null);
  const settled = async () => {
    setToken(crypto.randomUUID());
    onSent();
    // The message shows at once as queued, and the chat moves to the top of the list.
    await Promise.all([invalidate("messages"), invalidate("chats"), invalidate("chat")]);
  };
  const sendText = useMutation(trpc.inbox.send.mutationOptions({ onSuccess: settled }));
  const sendFile = useMutation({
    mutationFn: async ({
      file,
      caption,
      replyToMessageId,
    }: {
      file: File;
      caption: string | undefined;
      replyToMessageId: string | undefined;
    }) => {
      const abort = new AbortController();
      stop.current = abort;
      startPendingSend(conversationId, file, caption);
      const slot = await client.inbox.requestMediaUpload.mutate(
        { conversationId, fileName: file.name, contentType: file.type as never, sizeBytes: file.size },
        { signal: abort.signal },
      );
      await uploadFile(slot.upload, file, {
        signal: abort.signal,
        onProgress: (fraction) => {
          progressOfPendingSend(conversationId, fraction);
        },
      });
      return client.inbox.sendMedia.mutate({
        conversationId,
        messageId: slot.messageId,
        attachmentId: slot.attachmentId,
        clientToken: token,
        ...(caption === undefined ? {} : { caption }),
        ...(replyToMessageId === undefined ? {} : { replyToMessageId }),
      });
    },
    onSuccess: settled,
    onSettled: () => {
      stop.current = null;
      endPendingSend(conversationId);
    },
  });
  const error = sendText.error ?? sendFile.error;
  return {
    sendText: (text: string, replyToMessageId?: string, aiDraftId?: string) => {
      sendText.mutate({
        conversationId,
        clientToken: token,
        text,
        ...(replyToMessageId === undefined ? {} : { replyToMessageId }),
        ...(aiDraftId === undefined ? {} : { aiDraftId }),
      });
    },
    sendFile: (file: File, caption: string | undefined, replyToMessageId?: string) => {
      sendFile.mutate({ file, caption, replyToMessageId });
    },
    /** Stops a file on its way up; the file stays in the box to try again or take off. */
    cancel: () => {
      stop.current?.abort();
    },
    uploading: sendFile.isPending,
    pending: sendText.isPending || sendFile.isPending,
    error: wasStopped(error) ? null : error,
  };
}
