"use client";

// What the AI sales agent learned from the agency's chats (the owner, 2026-10-28): each lesson with its kind (what
// customers want, what wins, an objection and its answer, how to speak, a common question) and how many chats showed
// it; the owner turns one off or removes it. It learns by itself each night; "Learn now" runs it at once.
import type { AiLearning, AiSettings } from "@travel-crm/contracts/ai";
import { BrainIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { RefusalAlert } from "@/components/refusal-alert";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { formatDayTime } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { useAiLearnings, useLearnNow, useSetLearning } from "./use-ai";

const kindTone: Record<AiLearning["kind"], StatusTone> = {
  need: "neutral",
  winning: "good",
  objection: "attention",
  style: "neutral",
  faq: "neutral",
};

function Lesson({ lesson, disabled }: { lesson: AiLearning; disabled: boolean }) {
  const t = useTranslations("ai.learnings");
  const set = useSetLearning();
  return (
    <Item variant="muted">
      <ItemContent>
        <ItemTitle className="flex-wrap">
          <StatusBadge tone={kindTone[lesson.kind]}>{t(`kinds.${lesson.kind}`)}</StatusBadge>
          <span className="text-caption font-normal text-muted-foreground">
            {t("evidence", { count: lesson.evidence })}
          </span>
        </ItemTitle>
        <ItemDescription className="line-clamp-none text-foreground">{lesson.text}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Switch
          checked={lesson.state === "active"}
          aria-label={t("use")}
          disabled={disabled || set.isPending}
          onCheckedChange={(on) => {
            set.mutate({ learningId: lesson.id, state: on ? "active" : "off" });
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("remove")}
          disabled={disabled || set.isPending}
          onClick={() => {
            set.mutate({ learningId: lesson.id, state: "dismissed" });
          }}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </ItemActions>
    </Item>
  );
}

export function LearningsSection({ settings }: { settings: AiSettings }) {
  const t = useTranslations("ai.learnings");
  const { timeZone } = useMe().organization;
  const access = useWriteAccess("change");
  const learnings = useAiLearnings();
  const learn = useLearnNow();
  const lessons = learnings.data ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("title")}</h2>
        </CardTitle>
        <CardDescription>
          {t("description")}{" "}
          {settings.learnedAt === null
            ? t("never")
            : t("last", { when: formatDayTime(new Date(settings.learnedAt), { timeZone }) })}
        </CardDescription>
        {settings.configured && (
          <CardAction>
            <Button
              variant="outline"
              disabled={!access.allowed || learn.isPending}
              onClick={() => {
                learn.mutate(undefined, {
                  onSuccess: (result) => toast.success(t("learned", { added: result.added, updated: result.updated })),
                });
              }}
            >
              {learn.isPending ? <Spinner aria-hidden="true" /> : <BrainIcon aria-hidden="true" />}
              {learn.isPending ? t("learning") : t("learnNow")}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <RefusalAlert error={learn.error ?? learnings.error} />
        {lessons.length === 0 ? (
          <EmptyState icon={BrainIcon} message={t("empty")} />
        ) : (
          <ItemGroup className="gap-2">
            {lessons.map((lesson) => (
              <Lesson key={lesson.id} lesson={lesson} disabled={!access.allowed} />
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}
