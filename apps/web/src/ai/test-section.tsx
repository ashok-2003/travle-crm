"use client";

// Try it: the owner writes as a customer and the AI agent answers, turn after turn, in a chat laid out as WhatsApp lays
// one out (the customer's lines on the left, the agent's on the right), with "Why" under each answer. Each turn sends the
// chat so far, the state the last turn handed back, and the model and temperature chosen for this chat. The chat lives
// only in this screen's state, never stored or in the address; Start again empties it and keeps the choice. Nothing is
// sent to anyone; each answer spends some of the month's AI calls.
import {
  TEST_CHAT_LINES,
  TEST_LINE_MAX,
  type TestAiAnswer,
  type TestAiLine,
  type TestAiState,
} from "@travel-crm/contracts/ai";
import { RotateCcwIcon, SendHorizontalIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { liveChoice, TestChoices } from "./test-choices";
import { TestTurn } from "./test-turn";
import { useTestAi } from "./use-ai";

type Entry = { from: "customer"; text: string } | { from: "agent"; answer: TestAiAnswer };

/** The chat as the api reads it, its newest lines: an agent's line is only words it would have sent. */
function linesOf(entries: readonly Entry[]): TestAiLine[] {
  return entries
    .flatMap((entry): TestAiLine[] => {
      if (entry.from === "customer") return [entry];
      const words = entry.answer.answer.trim();
      return words === "" ? [] : [{ from: "agent", text: words.slice(0, TEST_LINE_MAX) }];
    })
    .slice(-TEST_CHAT_LINES);
}

export function TestSection() {
  const t = useTranslations("ai.test");
  const id = useId();
  const test = useTestAi();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [state, setState] = useState<TestAiState | null>(null);
  const [draft, setDraft] = useState("");
  const [choice, setChoice] = useState(liveChoice);

  const send = () => {
    const text = draft.trim();
    if (text === "" || test.isPending) return;
    const next: Entry[] = [...entries, { from: "customer", text }];
    setEntries(next);
    setDraft("");
    test.mutate(
      { messages: linesOf(next), state, ...choice },
      {
        onSuccess: (answer) => {
          setEntries((shown) => [...shown, { from: "agent", answer }]);
          setState(answer.state);
        },
      },
    );
  };
  const reset = () => {
    setEntries([]);
    setState(null);
    setDraft("");
    test.reset();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("title")}</h2>
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <TestChoices choice={choice} onChange={setChoice} disabled={test.isPending} />
        {entries.length > 0 && (
          <ol aria-label={t("thread")} className="flex flex-col gap-2 rounded-lg bg-chat-wallpaper p-4">
            {entries.map((entry, index) =>
              // The chat only grows, and Start again empties it: a line's place is its identity.
              entry.from === "customer" ? (
                <li
                  key={index}
                  className="max-w-[85%] self-start rounded-lg rounded-tl-none bg-chat-bubble-in px-3 py-2 whitespace-pre-line wrap-anywhere"
                >
                  <span className="sr-only">{t("customer")} </span>
                  {entry.text}
                </li>
              ) : (
                <TestTurn key={index} answer={entry.answer} />
              ),
            )}
            {test.isPending && (
              <li className="self-end">
                <p role="status" className="flex items-center gap-2 text-caption text-muted-foreground">
                  <Spinner />
                  {t("thinking")}
                </p>
              </li>
            )}
          </ol>
        )}
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <Field>
            <FieldLabel htmlFor={id}>{t("message")}</FieldLabel>
            <Input
              id={id}
              value={draft}
              maxLength={TEST_LINE_MAX}
              placeholder={t("placeholder")}
              onChange={(event) => {
                setDraft(event.target.value);
              }}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={test.isPending || draft.trim() === ""}>
              {test.isPending ? <Spinner /> : <SendHorizontalIcon aria-hidden="true" />}
              {t("send")}
            </Button>
            <Button type="button" variant="outline" disabled={test.isPending || entries.length === 0} onClick={reset}>
              <RotateCcwIcon aria-hidden="true" />
              {t("reset")}
            </Button>
          </div>
        </form>
        <RefusalAlert error={test.error} />
      </CardContent>
    </Card>
  );
}
