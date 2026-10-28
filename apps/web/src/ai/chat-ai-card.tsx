"use client";

// A chat's AI, in the contact panel: whether it answers here (the agency's default, on or off), whether it handed the chat to
// a person and why (with a way to give it back), what it flagged for the team and when it follows up. Every message it sends
// is marked "Sent by the AI" in the chat. Hidden for an agency without the AI.
import { BotIcon, BotOffIcon, HandIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { RefusalAlert } from "@/components/refusal-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDayTime } from "@/lib/format";
import { useHolds, useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { ChatVoicePanel } from "./chat-voice-panel";
import { useChatAi, useResumeChatAi, useSetChatAi } from "./use-ai";

const modes = ["default", "on", "off"] as const;

export function ChatAiCard({ conversationId }: { conversationId: string }) {
  const t = useTranslations("ai.chat");
  const ai = useChatAi(conversationId);
  const setMode = useSetChatAi(conversationId);
  const resume = useResumeChatAi(conversationId);
  const access = useWriteAccess("change");
  const mayReply = useHolds("inbox:reply");
  const { timeZone } = useMe().organization;
  if (ai.data === undefined) {
    return ai.isError ? (
      <LoadFailedAlert message={t("loadFailed")} error={ai.error} onRetry={() => void ai.refetch()} />
    ) : null;
  }
  const state = ai.data;
  if (!state.available) return null;
  const busy = setMode.isPending || resume.isPending || !access.allowed || !mayReply;
  return (
    <section className="flex flex-col gap-3" aria-label={t("title")}>
      <h3 className="flex items-center gap-2 text-label font-medium text-muted-foreground">
        {state.answering ? (
          <BotIcon aria-hidden="true" className="size-4 text-people-tint-ink" />
        ) : (
          <BotOffIcon aria-hidden="true" className="size-4" />
        )}
        {t("title")}
      </h3>
      <p className={state.answering ? "font-medium text-people-tint-ink" : "text-muted-foreground"}>
        {state.handedOff
          ? t("handedOff")
          : state.turn === "thinking"
            ? t("thinking")
            : state.turn === "queued"
              ? t("queued")
              : state.answering
                ? t("answering")
                : t("notAnswering")}
      </p>
      {state.personPausedUntil !== null && (
        <p className="text-label text-muted-foreground">
          {t("personPaused", { until: formatDayTime(new Date(state.personPausedUntil), { timeZone }) })}
        </p>
      )}
      {state.handedOff && (
        <Alert>
          <HandIcon aria-hidden="true" />
          <AlertTitle>{t("handoffTitle")}</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>{state.handoffReason ?? t("handoffNoReason")}</span>
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              disabled={busy}
              onClick={() => {
                resume.mutate({ conversationId });
              }}
            >
              {resume.isPending && <Spinner aria-hidden="true" />}
              {t("resume")}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {state.attention !== null && (
        <Alert>
          <AlertTitle>{t("attentionTitle")}</AlertTitle>
          <AlertDescription>{state.attention}</AlertDescription>
        </Alert>
      )}
      {state.followUpAt !== null && (
        <p className="text-label text-muted-foreground">
          {t("followUp", { when: formatDayTime(new Date(state.followUpAt), { timeZone }) })}
          {state.followUpReason === null ? "" : ` · ${state.followUpReason}`}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="text-label text-muted-foreground">{t("modeLabel")}</span>
        <ToggleGroup
          type="single"
          variant="outline"
          value={state.mode}
          disabled={busy}
          aria-label={t("modeLabel")}
          onValueChange={(next) => {
            const mode = modes.find((one) => one === next);
            if (mode !== undefined) setMode.mutate({ conversationId, mode });
          }}
        >
          {modes.map((mode) => (
            <ToggleGroupItem key={mode} value={mode} className="h-11">
              {t(`modes.${mode}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <RefusalAlert error={setMode.error ?? resume.error} />
      <ChatVoicePanel conversationId={conversationId} voice={state.voice} disabled={busy} />
    </section>
  );
}
