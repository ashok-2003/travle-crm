"use client";

// Who writes next in a chat, said plainly (the AI sales agent): at the foot of the messages, the agent's "typing" bubble
// while it reads the customer's message and writes its answer; over the reply box, a line that says whether the AI or
// a person has this chat (and what the AI flagged for the team, and its next planned follow-up), with the one button
// that changes it (Take over, Let the AI answer). An agency whose agent is off, or not set up, gets that said instead,
// never a button that would hand the chat to an AI that answers nothing. When the agent's turn ends, the chat loads
// again at once, so its answer shows without waiting for the next refresh.
import { BotIcon, BotOffIcon, CalendarClockIcon, HandIcon, PauseCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, type ReactNode } from "react";
import { cardTints } from "@/components/card-tints";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Item, ItemActions, ItemContent, ItemMedia } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { useRefreshInbox } from "@/inbox/use-inbox";
import { formatDayTime, formatTime } from "@/lib/format";
import { routes } from "@/lib/routes";
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
        <span className="flex items-center gap-1 rounded-lg rounded-tr-none bg-chat-bubble-ai px-3 py-2.5">
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

/** One highlighted line (violet while the AI answers, amber and bold when it handed over, quiet when off) that opens for the rest. */
function Strip(props: {
  tone: "ai" | "attention" | "quiet";
  icon: ReactNode;
  line: string;
  more?: ReactNode;
  action: ReactNode;
}) {
  const { tone, icon, line, more, action } = props;
  return (
    <Collapsible className={cn("rounded-md", tone === "quiet" ? "bg-muted/50" : cardTints[tone])}>
      <Item size="sm">
        <ItemMedia variant="icon">{icon}</ItemMedia>
        <ItemContent>
          <CollapsibleTrigger className="min-h-11 text-left">
            <span className={cn("line-clamp-1 text-sm", tone === "attention" && "font-semibold")}>{line}</span>
          </CollapsibleTrigger>
        </ItemContent>
        <ItemActions>{action}</ItemActions>
      </Item>
      <CollapsibleContent className="flex flex-col gap-1 px-4 pb-3 text-sm">
        <p>{line}</p>
        {more}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Over the reply box: the AI or a person has this chat, and the button that hands it the other way. */
export function AiReplyBar({ conversationId }: { conversationId: string }) {
  const t = useTranslations("ai.chat");
  const ai = useChatAi(conversationId).data;
  const setMode = useSetChatAi(conversationId);
  const resume = useResumeChatAi(conversationId);
  const access = useWriteAccess("change");
  const mayReply = useHolds("inbox:reply");
  const mayManage = useHolds("ai:manage");
  const { timeZone } = useMe().organization;
  if (ai?.available !== true) return null;
  if (ai.agent !== "ready") {
    return (
      <Strip
        tone="quiet"
        icon={<BotOffIcon aria-hidden="true" />}
        line={t(ai.agent === "off" ? "agentOff" : "agentNotReady")}
        action={mayManage && <TextLink href={routes.aiAgent}>{t("agentLink")}</TextLink>}
      />
    );
  }
  const busy = setMode.isPending || resume.isPending || !access.allowed || !mayReply;
  const button = (label: string, onClick: () => void) => (
    <Button variant="link" size="sm" className="min-h-11" disabled={busy} onClick={onClick}>
      {(setMode.isPending || resume.isPending) && <Spinner aria-hidden="true" />}
      {label}
    </Button>
  );
  if (ai.handedOff) {
    return (
      <Strip
        tone="attention"
        icon={<HandIcon aria-hidden="true" />}
        line={t("barHandedOff", { reason: ai.handoffReason ?? t("handoffNoReason") })}
        action={button(t("letAnswer"), () => {
          resume.mutate({ conversationId });
        })}
      />
    );
  }
  // Someone on the team wrote here: the AI waits, and says till when, with the way to let it answer now.
  if (ai.answering && ai.turn === null && ai.personPausedUntil !== null) {
    return (
      <Strip
        tone="ai"
        icon={<PauseCircleIcon aria-hidden="true" />}
        line={t("barPaused", { until: formatTime(new Date(ai.personPausedUntil), { timeZone }) })}
        action={button(t("answerNow"), () => {
          resume.mutate({ conversationId });
        })}
      />
    );
  }
  const followUp =
    ai.answering && ai.turn === null && ai.followUpAt !== null
      ? formatDayTime(new Date(ai.followUpAt), { timeZone })
      : null;
  const line = !ai.answering
    ? t("barOff")
    : ai.turn !== null
      ? t("barWorking")
      : ai.attention !== null
        ? t("barFlagged", { reason: ai.attention })
        : followUp !== null
          ? t("barAnsweringFollowUp", { when: followUp })
          : t("barAnswering");
  return (
    <Strip
      tone={ai.answering ? "ai" : "quiet"}
      icon={ai.turn === null ? <BotIcon aria-hidden="true" /> : <Spinner aria-hidden="true" />}
      line={line}
      more={
        followUp !== null && (
          <span className="flex items-center gap-1 text-caption">
            <CalendarClockIcon aria-hidden="true" className="size-3.5 shrink-0" />
            {ai.followUpReason === null
              ? t("followUpPlanned", { when: followUp })
              : t("followUpWhy", { when: followUp, why: ai.followUpReason })}
          </span>
        )
      }
      action={
        ai.answering
          ? button(t("takeOver"), () => {
              setMode.mutate({ conversationId, mode: "off" });
            })
          : button(t("letAnswer"), () => {
              setMode.mutate({ conversationId, mode: "on" });
            })
      }
    />
  );
}
