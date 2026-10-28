"use client";

// Settings, AI: what the AI learned from the agency's chats (General lessons, never about one person), each one the owner
// can turn off or dismiss, and "Learn now". Chats are sent to the AI only when learning is switched on above.
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { formatDayTime } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { useLearnings, useLearnNow, useSetLearning } from "./use-ai";

export function LearningsSection({ learnedAt, learning }: { learnedAt: string | null; learning: boolean }) {
  const t = useTranslations("ai.learnings");
  const access = useWriteAccess("change");
  const { timeZone } = useMe().organization;
  const lessons = useLearnings();
  const setLearning = useSetLearning();
  const learnNow = useLearnNow();
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("title")}</h2>
        </CardTitle>
        <CardDescription>
          {t("intro")}{" "}
          {learnedAt === null ? t("never") : t("last", { when: formatDayTime(new Date(learnedAt), { timeZone }) })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {lessons.isError ? (
          <LoadFailedAlert message={t("loadFailed")} error={lessons.error} onRetry={() => void lessons.refetch()} />
        ) : lessons.data === undefined || lessons.data.length === 0 ? (
          <p className="text-muted-foreground">{learning ? t("empty") : t("learningOff")}</p>
        ) : (
          <ItemGroup>
            {lessons.data.map((lesson) => (
              <Item key={lesson.id} role="listitem">
                <ItemContent>
                  <ItemTitle>{lesson.text}</ItemTitle>
                  <ItemDescription>
                    {t(`kinds.${lesson.kind}`)} · {t("evidence", { count: lesson.evidence })}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Switch
                    aria-label={t("use", { text: lesson.text })}
                    checked={lesson.state === "active"}
                    disabled={setLearning.isPending || !access.allowed}
                    onCheckedChange={(on) => {
                      setLearning.mutate({ learningId: lesson.id, state: on ? "active" : "off" });
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={setLearning.isPending || !access.allowed}
                    onClick={() => {
                      setLearning.mutate({ learningId: lesson.id, state: "dismissed" });
                    }}
                  >
                    {t("dismiss")}
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
        <RefusalAlert error={setLearning.error ?? learnNow.error} />
        <Button
          variant="outline"
          className="self-start"
          disabled={!learning || learnNow.isPending || !access.allowed}
          onClick={() => {
            learnNow.mutate(undefined, {
              onSuccess: (done) => toast.success(t("learned", { added: done.added, updated: done.updated })),
            });
          }}
        >
          {learnNow.isPending && <Spinner aria-hidden="true" />}
          {t("learnNow")}
        </Button>
      </CardContent>
    </Card>
  );
}
