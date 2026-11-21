"use client";

// The Follow-ups card's last contact (the lead page's revamp, 2026-11-21): the newest of the lead's calls and WhatsApp
// messages in one line, "They wrote “Ok thanks” · 2 hr ago", "We wrote …", "The AI wrote …", "They sent: Photo · …" or
// "Call: Spoke · 3 hr ago". Read from what the page already loads, so it asks nothing new: the timeline's call entries (its newest page) and
// the lead's chat (its newest messages, the WhatsApp section's own query). Null when there is neither; undefined while
// the timeline is still loading.
import type { ChatMessage } from "@travel-crm/contracts/inbox";
import { useTranslations } from "next-intl";
import { kindLabels } from "@/inbox/quote-block";
import { useLeadChat, useMessages } from "@/inbox/use-inbox";
import { elapsed } from "@/lib/relative-time";
import { useNow } from "@/lib/use-now";
import { useHolds } from "@/session/me-context";
import { useSubscription } from "@/subscription/use-subscription";
import { useTimeline } from "./use-timeline";

/** The lead's chat's messages, newest first, where the member and the plan have the inbox. */
function useChatMessages(leadId: string): ChatMessage[] {
  const mayRead = useHolds("inbox:view");
  const modules = useSubscription().data?.modules;
  const onPlan = modules === undefined || modules.includes("inbox");
  const conversationId = useLeadChat(leadId, mayRead && onPlan).data?.conversationId ?? null;
  return useMessages(conversationId ?? "", conversationId !== null).items ?? [];
}

export function useLastContact(leadId: string): string | null | undefined {
  const t = useTranslations("leads");
  const tKinds = useTranslations("inbox.chat.quote.kinds");
  const now = useNow();
  const calls = useTimeline(leadId).items;
  const message = useChatMessages(leadId)[0];
  if (calls === undefined) return undefined;
  const call = calls.find((entry) => entry.kind === "call");
  const ago = (at: string) => {
    const { unit, count } = elapsed(new Date(at), now);
    return t(`next.elapsed.${unit}`, { count });
  };
  const newer = (one: string, other: string) => new Date(one).getTime() > new Date(other).getTime();
  if (message !== undefined && (call === undefined || newer(message.occurredAt, call.occurredAt))) {
    const words = [message.body, message.caption].find((text): text is string => text !== null && text.trim() !== "");
    const who = message.direction === "in" ? "they" : message.byAi ? "ai" : "we";
    // Words are quoted; a photo or a voice note with none is named by its kind ("They sent: Photo").
    return words === undefined
      ? t(`lead.followUps.${who}Sent`, { kind: tKinds(kindLabels[message.kind]), ago: ago(message.occurredAt) })
      : t(`lead.followUps.${who}Wrote`, { words, ago: ago(message.occurredAt) });
  }
  if (call?.kind !== "call") return null;
  return t("lead.followUps.called", {
    outcome: t(`call.note.outcomes.${call.outcome}`),
    ago: ago(call.occurredAt),
  });
}
