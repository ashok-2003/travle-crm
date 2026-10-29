"use client";

// The reply box's sparkle: a reply the AI would write now, from the chat and the agency's knowledge, put in the box for the
// person to read, change and send. It never sends: the draft's id travels with the box so a sent reply can be audited as
// drafted by AI. Shown only where Suggest reply is on for the member, the plan and the agency.
import { SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useErrorMessage } from "@/lib/error-message";
import { useSuggestReply } from "./use-ai";

/** The AI's draft the box began as: its id, for the audit when it is sent, and its words, to tell whether they are still its own. */
export interface AiDraft {
  id: string;
  text: string;
}

export function SuggestButton({
  conversationId,
  disabled,
  onDraft,
}: {
  conversationId: string;
  disabled: boolean;
  onDraft: (draft: AiDraft) => void;
}) {
  const t = useTranslations("ai.suggest");
  const { apiError } = useErrorMessage();
  const suggest = useSuggestReply();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="text-primary"
      aria-label={t("button")}
      title={t("button")}
      disabled={disabled || suggest.isPending}
      onClick={() => {
        suggest.mutate(
          { conversationId },
          {
            onSuccess: (reply) => {
              if (reply.text === "") toast.info(t("nothing"));
              else onDraft({ id: reply.draftId, text: reply.text });
            },
            onError: (error) => toast.error(apiError(error)),
          },
        );
      }}
    >
      {suggest.isPending ? <Spinner aria-hidden="true" /> : <SparklesIcon aria-hidden="true" />}
    </Button>
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
