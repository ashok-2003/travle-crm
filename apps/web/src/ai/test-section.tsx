"use client";

// Settings, AI: the test box (Ayush's, ported): ask what a customer might and see what the AI would answer from what it knows and
// has learned, in the green bubble a customer would see. Nothing is sent, and it spends one of the month's AI calls.
import { SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useTestAi } from "./use-ai";

export function TestSection() {
  const t = useTranslations("ai.test");
  const id = useId();
  const test = useTestAi();
  const [question, setQuestion] = useState("");
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("title")}</h2>
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            if (question.trim() !== "") test.mutate({ question });
          }}
        >
          <Field className="flex-1">
            <FieldLabel htmlFor={id}>{t("question")}</FieldLabel>
            <Input
              id={id}
              value={question}
              maxLength={1000}
              placeholder={t("placeholder")}
              onChange={(event) => {
                setQuestion(event.target.value);
              }}
            />
          </Field>
          <Button type="submit" disabled={test.isPending || question.trim() === ""}>
            {test.isPending ? <Spinner aria-hidden="true" /> : <SparklesIcon aria-hidden="true" />}
            {t("ask")}
          </Button>
        </form>
        <RefusalAlert error={test.error} />
        {test.data !== undefined && (
          <div className="flex flex-col gap-2 rounded-lg bg-chat-wallpaper p-4">
            <p className="self-start rounded-lg rounded-tl-none bg-chat-bubble-in px-3 py-2">{question}</p>
            <p className="max-w-[85%] self-end rounded-lg rounded-tr-none bg-chat-bubble-out px-3 py-2 whitespace-pre-line">
              {test.data.answer === "" ? t("noAnswer") : test.data.answer}
            </p>
            {test.data.handoff && (
              <p className="self-end text-caption text-status-attention-ink">
                {t("handoff", { reason: test.data.reason === "" ? t("noReason") : test.data.reason })}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
