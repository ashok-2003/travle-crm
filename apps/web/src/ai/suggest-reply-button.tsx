"use client";

// Suggest reply in the composer: one button that puts the AI's draft in the reply box, and the people-tint note that says the
// words are the AI's until the person changes them. It never sends: the person reads, changes and sends, as for any reply.
import { SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useSuggestReply } from "./use-ai";

/** The AI's draft the box began as: its id, for the audit when it is sent, and its words, to tell whether they are still its own. */
export interface AiDraft {
  id: string;
  text: string;
}

export function SuggestReplyButton({
  conversationId,
  disabled,
  onDraft,
}: {
  conversationId: string;
  disabled: boolean;
  onDraft: (draft: AiDraft) => void;
}) {
  const t = useTranslations("ai.suggest");
  const suggest = useSuggestReply();
  return (
    <div className="flex flex-col gap-2">
      <RefusalAlert error={suggest.error} />
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={disabled || suggest.isPending}
        onClick={() => {
          suggest.mutate(
            { conversationId },
            { onSuccess: (reply) => { onDraft({ id: reply.draftId, text: reply.text }); } },
          );
        }}
      >
        {suggest.isPending ? <Spinner aria-hidden="true" /> : <SparklesIcon aria-hidden="true" />}
        {suggest.isPending ? t("drafting") : t("button")}
      </Button>
    </div>
  );
}

/** "Drafted by AI" in the people tint, shown while the box still holds the AI's words. */
export function AiDraftNote() {
  const t = useTranslations("ai.suggest");
  return (
    <p className="flex items-center gap-2 rounded-badge bg-people-tint px-2 py-1 text-caption font-medium text-people-tint-ink">
      <SparklesIcon aria-hidden="true" className="size-3.5" />
      <span>{t("draftedByAi")}</span>
      <span className="font-normal">{t("draftedHint")}</span>
    </p>
  );
}
