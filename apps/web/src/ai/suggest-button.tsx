"use client";

// The reply box's ✨ (the AI sales agent): a reply the agent would write now, from the chat, what it remembers and the
// agency's knowledge, put in the box for the person to edit and send. Nothing is sent by itself. Shown only when the
// platform has an AI model set.
import { SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useErrorMessage } from "@/lib/error-message";
import { useChatAi, useSuggestReply } from "./use-ai";

export function SuggestButton({
  conversationId,
  disabled,
  onSuggest,
}: {
  conversationId: string;
  disabled: boolean;
  onSuggest: (text: string) => void;
}) {
  const t = useTranslations("ai.suggest");
  const { apiError } = useErrorMessage();
  const configured = useChatAi(conversationId).data?.configured === true;
  const suggest = useSuggestReply();
  if (!configured) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="text-primary"
      aria-label={t("label")}
      title={t("label")}
      disabled={disabled || suggest.isPending}
      onClick={() => {
        suggest.mutate(
          { conversationId },
          {
            onSuccess: ({ text }) => {
              if (text === "") toast.info(t("nothing"));
              else onSuggest(text);
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
