"use client";

// The lead's WhatsApp section (spec 3.2): the chat of the person the lead belongs to, on the lead's page, for whoever may see
// both the lead and the inbox. It is the same ChatPanel as the inbox's; with no chat yet it says so in a line.
import { MessageCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TextLink } from "@/components/text-link";
import { inboxRoute } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { useSubscription } from "@/subscription/use-subscription";
import { ChatPanel } from "./chat-panel";
import { useLeadChat } from "./use-inbox";

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
          <p className="text-muted-foreground">{t("none")}</p>
        ) : (
          <>
            <ChatPanel conversationId={conversationId} />
            <TextLink href={inboxRoute(conversationId)}>{t("open")}</TextLink>
          </>
        )}
      </CardContent>
    </Card>
  );
}
