"use client";

// "Ask your reports" (release ai2b): a question in your own words. The AI only picks which of the fixed reports answers it and
// for which range, seeing nothing of your data; the figures are that report's own, for the leads you may see. The answer says how
// the question was understood and lets you change the range. A question no report answers is declined with the three nearest
// reports. The question is kept nowhere.
import { askRanges, type AskRange, type ReportAnswer, type ReportQueryId } from "@travel-crm/contracts/reports";
import { SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatCalendarDay } from "@/lib/format";
import { AnswerTable } from "./answer-table";
import { useAskAvailable, useAskReport, useRunReport, type ReportChoice } from "./use-ask";

const isRange = (value: string): value is AskRange => askRanges.some((range) => range === value);

function Understood({ answer, onRange }: { answer: ReportAnswer; onRange: (range: AskRange) => void }) {
  const t = useTranslations("reports.ask");
  return (
    <div className="flex flex-col gap-3">
      <p>
        <span className="text-muted-foreground">{t("understood")} </span>
        <strong>
          {t(`queries.${answer.queryId}.title`)}
          {answer.range !== null && `, ${t(`ranges.${answer.range}`)}`}
        </strong>
      </p>
      {answer.range !== null && answer.from !== null && answer.to !== null && (
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <ToggleGroup
            type="single"
            variant="outline"
            aria-label={t("rangeLabel")}
            value={answer.range}
            onValueChange={(chosen) => {
              if (isRange(chosen)) onRange(chosen);
            }}
            className="flex-wrap"
          >
            {askRanges.map((range) => (
              <ToggleGroupItem key={range} value={range} className="min-h-11 px-4">
                {t(`ranges.${range}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-label text-muted-foreground">
            {t("period", { from: formatCalendarDay(answer.from), to: formatCalendarDay(answer.to) })}
          </p>
        </div>
      )}
    </div>
  );
}

export function AskReports() {
  const t = useTranslations("reports.ask");
  const available = useAskAvailable();
  const ask = useAskReport();
  const [question, setQuestion] = useState("");
  // A report picked after the AI's answer (another range, or one of the suggestions): run by the api with no AI call.
  const [choice, setChoice] = useState<ReportChoice | null>(null);
  const run = useRunReport(choice);
  if (!available) return null;

  const asked = ask.data;
  const shown: ReportAnswer | null =
    choice !== null ? (run.data ?? null) : asked?.kind === "answer" ? asked.answer : null;
  const suggestions: ReportQueryId[] = asked?.kind === "declined" ? asked.suggestions : [];
  const used = asked === undefined ? null : t("usage", { used: asked.usedThisMonth, limit: asked.monthlyLimit });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("intro")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          noValidate
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (question.trim().length < 3) return;
            setChoice(null);
            ask.mutate({ question: question.trim() });
          }}
        >
          <Field>
            <FieldLabel htmlFor="ask-reports-question">{t("label")}</FieldLabel>
            <div className="flex flex-col gap-2 md:flex-row">
              <Input
                id="ask-reports-question"
                value={question}
                maxLength={300}
                placeholder={t("placeholder")}
                disabled={ask.isPending}
                onChange={(event) => {
                  setQuestion(event.target.value);
                }}
              />
              <Button type="submit" disabled={ask.isPending || question.trim().length < 3}>
                {ask.isPending ? <Spinner aria-hidden="true" /> : <SparklesIcon aria-hidden="true" />}
                {ask.isPending ? t("asking") : t("ask")}
              </Button>
            </div>
          </Field>
        </form>
        <RefusalAlert error={ask.error ?? run.error} />
        {asked?.kind === "declined" && choice === null && (
          <Alert>
            <AlertTitle>{t("declinedTitle")}</AlertTitle>
            <AlertDescription className="flex flex-col gap-2">
              <span>{t("declinedBody")}</span>
              <span className="flex flex-col gap-2 md:flex-row md:flex-wrap">
                {suggestions.map((queryId) => (
                  <Button
                    key={queryId}
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setChoice({ queryId });
                    }}
                  >
                    {t(`queries.${queryId}.question`)}
                  </Button>
                ))}
              </span>
            </AlertDescription>
          </Alert>
        )}
        {shown !== null && (
          <div className="flex flex-col gap-4">
            <Understood
              answer={shown}
              onRange={(range) => {
                setChoice({ queryId: shown.queryId, range });
              }}
            />
            <AnswerTable answer={shown} />
          </div>
        )}
        {used !== null && <p className="text-label text-muted-foreground">{used}</p>}
      </CardContent>
    </Card>
  );
}
