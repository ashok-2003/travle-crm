"use client";

// Try it: the owner writes as a customer and the AI agent answers, turn after turn, in a chat laid out as WhatsApp lays
// one out (the customer's lines on the left, the agent's on the right), with "Why" under each answer. Each turn sends the
// chat so far, the state the last turn handed back, and the model and temperature chosen for this chat, to the chosen
// agent's own procedure: the current agent's ai.test or the new agent's ai.testNatural (ruling 7), so choosing the other
// agent empties the chat. The chat lives only in this screen's state, never stored or in the address; Start again
// empties it and keeps the choice. The new agent's turns also send the test chat's id, a random one each time the chat
// starts, which groups its turns' traces. Nothing is sent to anyone; each answer spends some of the month's AI calls.
import {
  TEST_CHAT_LINES,
  TEST_LINE_MAX,
  type NaturalTestAnswer,
  type NaturalTestState,
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
import { liveChoice, TestChoices, type TestChoice } from "./test-choices";
import { TestNaturalTurn } from "./test-natural-turn";
import { TestTurn } from "./test-turn";
import { useTestAi, useTestNatural } from "./use-ai";

type Entry =
  | { from: "customer"; text: string }
  | { from: "agent"; answer: TestAiAnswer }
  | { from: "natural"; answer: NaturalTestAnswer };

/** What the last turn handed back, for the agent that answered it: one agent's state means nothing to the other. */
interface ChatState {
  current: TestAiState | null;
  natural: NaturalTestState | null;
}
const noState: ChatState = { current: null, natural: null };

/**
 * The chat as the api reads it, its newest lines: the current agent's line is only words it would have sent; the new
 * agent's are its answer's history (its messages, then a mark for each brochure, offer and hold).
 */
function linesOf(entries: readonly Entry[]): TestAiLine[] {
  return entries
    .flatMap((entry): TestAiLine[] => {
      if (entry.from === "customer") return [entry];
      if (entry.from === "natural") return entry.answer.history;
      const words = entry.answer.answer.trim();
      return words === "" ? [] : [{ from: "agent", text: words.slice(0, TEST_LINE_MAX) }];
    })
    .slice(-TEST_CHAT_LINES);
}

export function TestSection() {
  const t = useTranslations("ai.test");
  const id = useId();
  const test = useTestAi();
  const natural = useTestNatural();
  const pending = test.isPending || natural.isPending;
  const [entries, setEntries] = useState<Entry[]>([]);
  const [state, setState] = useState(noState);
  const [chatId, setChatId] = useState(() => crypto.randomUUID());
  const [draft, setDraft] = useState("");
  const [choice, setChoice] = useState(liveChoice);

  const send = () => {
    const text = draft.trim();
    if (text === "" || pending) return;
    const next: Entry[] = [...entries, { from: "customer", text }];
    setEntries(next);
    setDraft("");
    const turn = { messages: linesOf(next), model: choice.model, temperature: choice.temperature };
    if (choice.agent === "natural") {
      natural.mutate(
        { ...turn, state: state.natural, chatId },
        {
          onSuccess: (answer) => {
            setEntries((shown) => [...shown, { from: "natural", answer }]);
            setState({ ...noState, natural: answer.state });
          },
        },
      );
      return;
    }
    test.mutate(
      { ...turn, state: state.current },
      {
        onSuccess: (answer) => {
          setEntries((shown) => [...shown, { from: "agent", answer }]);
          setState({ ...noState, current: answer.state });
        },
      },
    );
  };
  const reset = () => {
    setEntries([]);
    setState(noState);
    setChatId(crypto.randomUUID());
    setDraft("");
    test.reset();
    natural.reset();
  };
  const choose = (next: TestChoice) => {
    if (next.agent !== choice.agent) reset();
    setChoice(next);
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
        <TestChoices choice={choice} onChange={choose} disabled={pending} />
        {entries.length > 0 && (
          <ol aria-label={t("thread")} className="flex flex-col gap-2 rounded-lg bg-chat-wallpaper p-4">
            {entries.map((entry, index) => {
              // The chat only grows, and Start again empties it: a line's place is its identity.
              if (entry.from === "agent") return <TestTurn key={index} answer={entry.answer} />;
              if (entry.from === "natural") return <TestNaturalTurn key={index} answer={entry.answer} />;
              return (
                <li
                  key={index}
                  className="max-w-[85%] self-start rounded-lg rounded-tl-none bg-chat-bubble-in px-3 py-2 whitespace-pre-line wrap-anywhere"
                >
                  <span className="sr-only">{t("customer")} </span>
                  {entry.text}
                </li>
              );
            })}
            {pending && (
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
            <Button type="submit" disabled={pending || draft.trim() === ""}>
              {pending ? <Spinner /> : <SendHorizontalIcon aria-hidden="true" />}
              {t("send")}
            </Button>
            <Button type="button" variant="outline" disabled={pending || entries.length === 0} onClick={reset}>
              <RotateCcwIcon aria-hidden="true" />
              {t("reset")}
            </Button>
          </div>
        </form>
        <RefusalAlert error={test.error ?? natural.error} />
      </CardContent>
    </Card>
  );
}
