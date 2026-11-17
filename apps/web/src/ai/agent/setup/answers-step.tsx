"use client";

// Setup step "Answers": the agency's own answers to the six questions customers ask, which the agent quotes.
import { agencyQuestionTopics, type AgencyAnswers, type AgencyQuestionTopic } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { useAgencyAnswers, useSaveAnswers } from "./use-setup-steps";

const MAX_ANSWER = 500;

function AnswersForm({ saved }: { saved: AgencyAnswers }) {
  const t = useTranslations("aiAgent");
  const hintId = `${useId()}-write`;
  const access = useWriteAccess("change");
  const save = useSaveAnswers();
  const [typed, setTyped] = useState<Record<AgencyQuestionTopic, string>>(
    () =>
      Object.fromEntries(agencyQuestionTopics.map((topic) => [topic, saved[topic] ?? ""])) as Record<
        AgencyQuestionTopic,
        string
      >,
  );
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ answers: typed }, { onSuccess: () => toast.success(t("setup.answers.saved")) });
      }}
    >
      <FieldGroup>
        {agencyQuestionTopics.map((topic) => (
          <FormField key={topic} label={t(`answers.questions.${topic}`)}>
            {(links) => (
              <Textarea
                {...links}
                rows={3}
                maxLength={MAX_ANSWER}
                value={typed[topic]}
                disabled={save.isPending}
                onChange={(event) => {
                  setTyped({ ...typed, [topic]: event.target.value });
                }}
              />
            )}
          </FormField>
        ))}
      </FieldGroup>
      <RefusalAlert error={save.error} />
      <div>
        <Button
          type="submit"
          disabled={!access.allowed || save.isPending}
          aria-describedby={access.allowed ? undefined : hintId}
        >
          {save.isPending ? t("setup.answers.saving") : t("setup.answers.save")}
        </Button>
        <WriteHint id={hintId} hint={access.hint} />
      </div>
    </form>
  );
}

export function AnswersStepEditor() {
  const t = useTranslations("aiAgent.setup.answers");
  const answers = useAgencyAnswers();
  if (answers.data !== undefined) return <AnswersForm saved={answers.data} />;
  return answers.isError ? (
    <LoadFailedAlert message={t("loadFailed")} error={answers.error} onRetry={() => void answers.refetch()} />
  ) : (
    <LoadingRows shape="twoLines" label={t("loading")} />
  );
}
