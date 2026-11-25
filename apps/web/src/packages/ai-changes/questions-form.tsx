"use client";

// The AI's questions, only where the message was unclear: each a few choices and a box for the agency's own words;
// answering shows the changes again.
import { useTranslations } from "next-intl";
import { ChoiceGroup } from "@/components/forms/choice-field";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { ProposedChanges } from "./use-package-changes-ai";

export interface QuestionAnswer {
  choice: string;
  typed: string;
}

export const answerOf = ({ choice, typed }: QuestionAnswer) => (typed.trim() === "" ? choice : typed.trim());

export function QuestionsForm({
  questions,
  answers,
  onAnswers,
  working,
  onSubmit,
}: {
  questions: ProposedChanges["questions"];
  answers: Record<string, QuestionAnswer>;
  onAnswers: (answers: Record<string, QuestionAnswer>) => void;
  working: boolean;
  onSubmit: () => void;
}) {
  const t = useTranslations("packages.aiChanges");
  const given = (id: string): QuestionAnswer => answers[id] ?? { choice: "", typed: "" };
  return (
    <section className="flex flex-col gap-4" aria-label={t("questionsTitle")}>
      <h3 className="text-sm font-medium">{t("questionsTitle")}</h3>
      {questions.map((question) => (
        <div key={question.id} className="flex flex-col gap-2">
          <ChoiceGroup
            legend={question.text}
            options={question.choices.map((choice) => ({ value: choice, label: choice }))}
            value={given(question.id).choice}
            onChange={(choice) => {
              onAnswers({ ...answers, [question.id]: { choice, typed: "" } });
            }}
          />
          <Field>
            <FieldLabel htmlFor={`question-${question.id}`}>{t("yourWords")}</FieldLabel>
            <Input
              id={`question-${question.id}`}
              value={given(question.id).typed}
              maxLength={200}
              onChange={(event) => {
                onAnswers({ ...answers, [question.id]: { ...given(question.id), typed: event.target.value } });
              }}
            />
          </Field>
        </div>
      ))}
      <Button
        className="self-start"
        disabled={working || questions.every((question) => answerOf(given(question.id)) === "")}
        onClick={onSubmit}
      >
        {working && <Spinner aria-hidden="true" />}
        {working ? t("working") : t("answer")}
      </Button>
    </section>
  );
}
