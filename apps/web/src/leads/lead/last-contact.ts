"use client";

// The Follow-ups card's last contact (the lead page's revamp, 2026-11-21): the newest of the lead's calls and WhatsApp
// messages in one line, "They wrote “Ok thanks” · 2 hr ago", "We wrote …", "The AI wrote …", "They sent: Photo · …" or
// "Call: Spoke · 3 hr ago". Read from what the page already loads, so it asks nothing new: the timeline's entries (its
// loaded pages) and the lead's chat (its newest messages, the WhatsApp section's own query). Without the chat (no inbox
// for this member or plan, or a chat that didn't load) the timeline's newest "wrote on WhatsApp" stands in for it.
// Undefined, and the row left out, while what it reads is still loading, and when nothing is found but older entries
// are still to load: it never says the wrong thing for a moment.
import type { ChatMessage } from "@travel-crm/contracts/inbox";
import { useTranslations } from "next-intl";
import { kindLabels } from "@/inbox/quote-block";
import { useLeadChat, useMessages } from "@/inbox/use-inbox";
import { elapsed } from "@/lib/relative-time";
import { useNow } from "@/lib/use-now";
import { useHolds } from "@/session/me-context";
import { useSubscription } from "@/subscription/use-subscription";
import { useTimeline } from "./use-timeline";

/** The lead's chat's newest message, null when there is none to read, undefined while it loads. */
function useNewestMessage(leadId: string): ChatMessage | null | undefined {
  const mayRead = useHolds("inbox:view");
  const modules = useSubscription().data?.modules;
  const onPlan = modules === undefined || modules.includes("inbox");
  const enabled = mayRead && onPlan;
  const chat = useLeadChat(leadId, enabled);
  const conversationId = chat.data?.conversationId ?? null;
  const messages = useMessages(conversationId ?? "", conversationId !== null);
  if (!enabled || chat.isError) return null;
  if (chat.data === undefined) return undefined;
  if (conversationId === null || messages.isError) return null;
  if (messages.items === undefined) return undefined;
  return messages.items[0] ?? null;
}

export function useLastContact(leadId: string): string | null | undefined {
  const t = useTranslations("leads");
  const tKinds = useTranslations("inbox.chat.quote.kinds");
  const now = useNow();
  const timeline = useTimeline(leadId);
  const message = useNewestMessage(leadId);
  const entries = timeline.items;
  if (entries === undefined || message === undefined) return undefined;
  const ago = (at: string) => {
    const { unit, count } = elapsed(new Date(at), now);
    return t(`next.elapsed.${unit}`, { count });
  };
  const time = (at: string) => new Date(at).getTime();
  const call = entries.find((entry) => entry.kind === "call");
  // The chat's own message when there is one to read; otherwise the timeline's note that the customer wrote.
  const wrote = message === null ? entries.find((entry) => entry.kind === "whatsapp-contact") : undefined;
  const callAt = call === undefined ? -Infinity : time(call.occurredAt);
  if (message !== null && time(message.occurredAt) > callAt) {
    const words = [message.body, message.caption].find((text): text is string => text !== null && text.trim() !== "");
    const who = message.direction === "in" ? "they" : message.byAi ? "ai" : "we";
    // Words are quoted; a photo or a voice note with none is named by its kind ("They sent: Photo").
    return words === undefined
      ? t(`lead.followUps.${who}Sent`, { kind: tKinds(kindLabels[message.kind]), ago: ago(message.occurredAt) })
      : t(`lead.followUps.${who}Wrote`, { words, ago: ago(message.occurredAt) });
  }
  if (wrote !== undefined && time(wrote.occurredAt) > callAt) {
    return t("lead.followUps.theyWroteOnWhatsApp", { ago: ago(wrote.occurredAt) });
  }
  if (call?.kind === "call") {
    return t("lead.followUps.called", { outcome: t(`call.note.outcomes.${call.outcome}`), ago: ago(call.occurredAt) });
  }
  // Nothing among the loaded entries: say "none" only once there are no older ones either.
  return timeline.hasNextPage ? undefined : null;
}
