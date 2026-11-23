"use client";

// Start a chat with a lead's person (spec 3.2; spec 2026-11-22 section 11): the chat the sending rule names (the number
// they last wrote to, else the main one) is made if need be, then the template dialog opens on it. On the lead's page for
// a person who never wrote, and in the reply box of a chat on a disconnected number.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/data/trpc";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { SendTemplateDialog } from "./send-template-dialog";

export function StartChat({ leadId }: { leadId: string }) {
  const t = useTranslations("inbox.leadSection");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const access = useWriteAccess("change");
  const mayReply = useHolds("inbox:reply");
  const mayEdit = useHolds("leads:edit");
  const mayStart = mayReply && mayEdit;
  const [chatId, setChatId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const start = useMutation(
    trpc.inbox.startChat.mutationOptions({
      onSuccess: async ({ conversationId }) => {
        await queryClient.invalidateQueries({ queryKey: trpc.inbox.pathKey() });
        setChatId(conversationId);
        setOpen(true);
      },
    }),
  );
  if (!mayStart) return null;
  return (
    <div className="flex flex-col items-start gap-2">
      <RefusalAlert error={start.error} />
      <Button
        ref={button}
        type="button"
        disabled={!access.allowed || start.isPending}
        onClick={() => {
          if (chatId === null) start.mutate({ leadId });
          else setOpen(true);
        }}
      >
        {t("startWithTemplate")}
      </Button>
      {chatId !== null && (
        <SendTemplateDialog conversationId={chatId} open={open} onOpenChange={setOpen} returnFocusTo={button} />
      )}
    </div>
  );
}
