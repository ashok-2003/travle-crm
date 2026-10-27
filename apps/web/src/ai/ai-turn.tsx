"use client";

// Who writes next in a chat, said plainly (the AI sales agent): at the foot of the messages, the agent's "typing" bubble
// while it reads the customer's message and writes its answer; over the reply box, a line that says whether the AI or
// a person has this chat (and what the AI flagged for the team, and its next planned follow-up), with the one button
// that changes it (Take over, Let the AI answer). When the agent's turn ends, the chat loads again at once, so its
// answer shows without waiting for the next refresh.
import { BotIcon, CalendarClockIcon, HandIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { useRefreshInbox } from "@/inbox/use-inbox";
import { formatDayTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useHolds, useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { useChatAi, useResumeChatAi, useSetChatAi } from "./use-ai";

/** The agent's first name as the agency named it ("Riya from Sharma Holidays" is Riya), else null. */
export function aiFirstName(agentName: string): string | null {
  const first = agentName.trim().split(/\s+/)[0];
  return first === undefined || first === "" ? null : first;
}

/** The agent writing: three dots in our bubble, as WhatsApp shows someone typing, and who it is. */
export function AiTyping({ conversationId }: { conversationId: string }) {
  const t = useTranslations("ai.chat");
  const ai = useChatAi(conversationId).data;
  const refresh = useRefreshInbox();
  const turn = ai?.turn ?? null;
  // Each change of the turn (a message taken, an answer sent) loads the chat again, so both show at once.
  const previous = useRef(turn);
  useEffect(() => {
    if (previous.current !== turn) void refresh();
    previous.current = turn;
  }, [turn, refresh]);
  if (ai === undefined || turn === null) return null;
  const name = aiFirstName(ai.agentName);
  return (
    <li className="mt-2 flex flex-row-reverse px-3 md:px-[6%]" role="status" aria-live="polite">
      <div className="flex flex-col items-end gap-1">
        <span className="flex items-center gap-1 rounded-lg rounded-tr-none bg-chat-bubble-out px-3 py-2.5">
          {["[animation-delay:0ms]", "[animation-delay:150ms]", "[animation-delay:300ms]"].map((delay) => (
            <span
              key={delay}
              aria-hidden="true"
              className={cn(
                "size-1.5 animate-bounce rounded-full bg-muted-foreground motion-reduce:animate-none",
                delay,
              )}
            />
          ))}
        </span>
        <span className="flex items-center gap-1 text-caption text-muted-foreground">
          <BotIcon aria-hidden="true" className="size-3.5" />
          {turn === "queued"
            ? name === null
              ? t("readingUnnamed")
              : t("reading", { name })
            : name === null
              ? t("typingUnnamed")
              : t("typing", { name })}
        </span>
      </div>
    </li>
  );
}

/** Over the reply box: the AI or a person has this chat, and the button that hands it the other way. */
export function AiReplyBar({ conversationId }: { conversationId: string }) {
  const t = useTranslations("ai.chat");
  const ai = useChatAi(conversationId).data;
  const setMode = useSetChatAi();
  const resume = useResumeChatAi();
  const access = useWriteAccess("change");
  const mayReply = useHolds("inbox:reply");
  const { timeZone } = useMe().organization;
  if (ai?.configured !== true) return null;
  const name = aiFirstName(ai.agentName) ?? t("theAi");
  const busy = setMode.isPending || resume.isPending || !access.allowed || !mayReply;
  const button = (label: string, onClick: () => void) => (
    <Button variant="outline" size="sm" disabled={busy} onClick={onClick}>
      {(setMode.isPending || resume.isPending) && <Spinner aria-hidden="true" />}
      {label}
    </Button>
  );
  if (ai.handedOff) {
    return (
      <Item variant="muted" size="sm">
        <ItemMedia variant="icon">
          <HandIcon aria-hidden="true" />
        </ItemMedia>
        <ItemContent>
          <ItemDescription className="line-clamp-2">
            {t("barHandedOff", { reason: ai.handoffReason ?? t("handoffNoReason") })}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          {button(t("letAnswer"), () => {
            resume.mutate({ conversationId });
          })}
        </ItemActions>
      </Item>
    );
  }
  return (
    <Item variant="muted" size="sm">
      <ItemMedia variant="icon">
        {ai.turn === null ? (
          <BotIcon aria-hidden="true" className={ai.answering ? "text-primary" : "text-muted-foreground"} />
        ) : (
          <Spinner aria-hidden="true" className="text-primary" />
        )}
      </ItemMedia>
      <ItemContent>
        <ItemDescription className={cn("line-clamp-2", ai.attention !== null && ai.answering && "text-foreground")}>
          {!ai.answering
            ? t("barOff")
            : ai.turn !== null
              ? t("barWorking", { name })
              : ai.attention !== null
                ? t("barFlagged", { name, reason: ai.attention })
                : t("barAnswering", { name })}
        </ItemDescription>
        {ai.answering && ai.turn === null && ai.followUpAt !== null && (
          <ItemDescription className="flex items-center gap-1 text-caption">
            <CalendarClockIcon aria-hidden="true" className="size-3.5 shrink-0" />
            {ai.followUpReason === null
              ? t("followUpPlanned", { when: formatDayTime(new Date(ai.followUpAt), { timeZone }) })
              : t("followUpWhy", {
                  when: formatDayTime(new Date(ai.followUpAt), { timeZone }),
                  why: ai.followUpReason,
                })}
          </ItemDescription>
        )}
      </ItemContent>
      <ItemActions>
        {ai.answering
          ? button(t("takeOver"), () => {
              setMode.mutate({ conversationId, mode: "off" });
            })
          : button(t("letAnswer"), () => {
              setMode.mutate({ conversationId, mode: "on" });
            })}
      </ItemActions>
    </Item>
  );
}
