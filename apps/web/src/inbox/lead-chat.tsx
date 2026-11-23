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
import { StartChat } from "./start-chat";
import { useLeadChat } from "./use-inbox";
import { useInboxLive } from "./use-inbox-live";

/** The lead's chat hears the live stream as the Inbox does: a reply or a tick shows here at once. */
function LiveChat({ conversationId }: { conversationId: string }) {
  useInboxLive({ openId: conversationId });
  return <ChatPanel key={conversationId} conversationId={conversationId} variant="lead" />;
}

/**
 * The WhatsApp button's way here when the customer has no chat yet (leadChatRoute: the lead's page at #whatsapp). The
 * section appears only once its chat has loaded, after the browser's own jump to the anchor, so it comes into view itself.
 */
function cameForChat(card: HTMLDivElement | null) {
  if (card !== null && window.location.hash === `#${card.id}`) card.scrollIntoView({ block: "start" });
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
    <Card id="whatsapp" ref={cameForChat}>
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
            <LiveChat key={conversationId} conversationId={conversationId} />
            <TextLink href={inboxRoute(conversationId)}>{t("open")}</TextLink>
          </>
        )}
      </CardContent>
    </Card>
  );
}
