"use client";

// The lead's WhatsApp section (spec 3.2): the chat of the person the lead belongs to, on the lead's page, for whoever may see
// both the lead and the inbox. It is the same ChatPanel as the inbox's; with no chat yet it says so in a line.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/data/trpc";
import { useWriteAccess } from "@/subscription/write-access";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TextLink } from "@/components/text-link";
import { inboxRoute } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { useSubscription } from "@/subscription/use-subscription";
import { ChatPanel } from "./chat-panel";
import { SendTemplateDialog } from "./send-template-dialog";
import { useLeadChat } from "./use-inbox";

/** Start a chat with a person who never wrote: the chat is made, then the template dialog opens on it. */
function StartChat({ leadId }: { leadId: string }) {
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

export function LeadChat({ leadId }: { leadId: string }) {
  const t = useTranslations("inbox.leadSection");
  const mayRead = useHolds("inbox:view");
  const modules = useSubscription().data?.modules;
  const onPlan = modules === undefined || modules.includes("inbox");
  const chat = useLeadChat(leadId, mayRead && onPlan);
  // No permission, no module, or a chat that is not there yet or did not load: nothing to show on the lead's page.
  if (!mayRead || !onPlan || chat.data === undefined) return null;
  const conversationId = chat.data.conversationId;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircleIcon aria-hidden="true" className="size-5" />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {conversationId === null ? (
          <>
            <p className="text-muted-foreground">{t("none")}</p>
            <StartChat leadId={leadId} />
          </>
        ) : (
          <>
            <ChatPanel conversationId={conversationId} variant="lead" />
            <TextLink href={inboxRoute(conversationId)}>{t("open")}</TextLink>
          </>
        )}
      </CardContent>
    </Card>
  );
}
