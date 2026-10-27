"use client";

// A chat's AI agent, in the contact panel (the AI sales agent): whether it answers here (as the agency's default, on
// or off), whether it handed the chat to a person and why (with a way to give it back), what it remembers of the chat,
// and the lead's insight. Also the header's chip: the agent's state and the lead's score at a glance.
import { BotIcon, BotOffIcon, HandIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { InfoHint } from "@/components/info-hint";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { RefusalAlert } from "@/components/refusal-alert";
import { StatusBadge } from "@/components/status-badge";
import { TextLink } from "@/components/text-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { routes } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { InsightCard, ScoreBadge } from "./insight-card";
import { useChatAi, useResumeChatAi, useSetChatAi } from "./use-ai";

const modes = ["default", "on", "off"] as const;

/** The header's chip: the lead's score, and whether the AI is answering or handed the chat over. */
export function ChatAiChip({ conversationId }: { conversationId: string }) {
  const t = useTranslations("ai.chat");
  const ai = useChatAi(conversationId).data;
  if (ai?.configured !== true) return null;
  return (
    <span className="hidden items-center gap-1.5 md:inline-flex">
      {ai.handedOff ? (
        <StatusBadge tone="attention">{t("handedOffShort")}</StatusBadge>
      ) : (
        ai.answering && (
          <StatusBadge tone={ai.attention === null ? "good" : "attention"}>
            {ai.attention === null ? t("answeringShort") : t("flaggedShort")}
          </StatusBadge>
        )
      )}
      {ai.insight !== null && <ScoreBadge insight={ai.insight} />}
    </span>
  );
}

export function ChatAiCard({ conversationId }: { conversationId: string }) {
  const t = useTranslations("ai.chat");
  const ai = useChatAi(conversationId);
  const setMode = useSetChatAi();
  const resume = useResumeChatAi();
  const access = useWriteAccess("change");
  const mayReply = useHolds("inbox:reply");
  const mayManage = useHolds("settings:manage");
  if (ai.data === undefined) {
    return ai.isError ? (
      <LoadFailedAlert message={t("loadFailed")} error={ai.error} onRetry={() => void ai.refetch()} />
    ) : null;
  }
  const state = ai.data;
  const busy = setMode.isPending || resume.isPending || !access.allowed || !mayReply;
  return (
    <div className="flex flex-col gap-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {state.answering ? (
              <BotIcon aria-hidden="true" className="size-4 text-primary" />
            ) : (
              <BotOffIcon aria-hidden="true" className="size-4 text-muted-foreground" />
            )}
            <h3>{t("title")}</h3>
            <InfoHint term={t("title")}>{t("info")}</InfoHint>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!state.configured ? (
            <p className="text-muted-foreground">
              {t("notConfigured")}{" "}
              {mayManage && (
                <TextLink inline href={routes.aiSettings}>
                  {t("openSettings")}
                </TextLink>
              )}
            </p>
          ) : (
            <>
              <p className={state.answering ? "font-medium text-primary" : "text-muted-foreground"}>
                {state.handedOff ? t("handedOff") : state.answering ? t("answering") : t("notAnswering")}
              </p>
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
              <div className="flex flex-col gap-1.5">
                <span className="text-label text-muted-foreground">{t("modeLabel")}</span>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  aria-label={t("modeLabel")}
                  value={state.mode}
                  disabled={busy}
                  onValueChange={(chosen) => {
                    const mode = modes.find((one) => one === chosen);
                    if (mode !== undefined && mode !== state.mode) setMode.mutate({ conversationId, mode });
                  }}
                >
                  {modes.map((mode) => (
                    <ToggleGroupItem key={mode} value={mode}>
                      {t(`modes.${mode}`)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
              <RefusalAlert error={setMode.error ?? resume.error} />
              {state.memory !== "" && (
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="link" className="h-auto self-start p-0">
                      {t("memory")}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <p className="pt-2 whitespace-pre-line text-muted-foreground">{state.memory}</p>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </>
          )}
        </CardContent>
      </Card>
      {(state.configured || state.insight !== null) && <InsightCard insight={state.insight} />}
    </div>
  );
}
