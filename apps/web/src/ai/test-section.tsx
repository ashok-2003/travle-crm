"use client";

// Try it: the owner writes as a customer and the AI agent answers, turn after turn, in a chat laid out as WhatsApp lays
// one out (the customer's lines on the left, the agent's on the right), with "Why" under each answer. Each turn sends
// ai.testOne the chat so far, the state the last turn handed back, the prompt chosen for this chat (the live one or the
// draft being edited in Langfuse, which each answer keeps for its "Why") and the test chat's id, a random one each time
// the chat starts, which groups its turns' traces. The chat lives only in this screen's state, never stored or in the
// address; Start again empties it and keeps the prompt. Nothing is sent to anyone; each answer spends some of the
// month's AI calls.
import {
  oneTestPrompts,
  TEST_CHAT_LINES,
  TEST_LINE_MAX,
  type NaturalTestAnswer,
  type NaturalTestState,
  type OneTestPrompt,
  type TestAiLine,
} from "@travel-crm/contracts/ai";
import { RotateCcwIcon, SendHorizontalIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { FormField } from "@/components/form-field";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { TestNaturalTurn } from "./test-natural-turn";
import { useTestOne } from "./use-ai";

type Entry = { from: "customer"; text: string } | { from: "agent"; answer: NaturalTestAnswer; prompt: OneTestPrompt };

/**
 * The chat as the api reads it, its newest lines: the agent's are its answer's history (its messages, then a mark for
 * each brochure, offer and hold).
 */
function linesOf(entries: readonly Entry[]): TestAiLine[] {
  return entries
    .flatMap((entry): TestAiLine[] => (entry.from === "customer" ? [entry] : entry.answer.history))
    .slice(-TEST_CHAT_LINES);
}

export function TestSection() {
  const t = useTranslations("ai.test");
  const id = useId();
  const one = useTestOne();
  const pending = one.isPending;
  const [entries, setEntries] = useState<Entry[]>([]);
  const [state, setState] = useState<NaturalTestState | null>(null);
  const [chatId, setChatId] = useState(() => crypto.randomUUID());
  const [draft, setDraft] = useState("");
  const [prompt, setPrompt] = useState<OneTestPrompt>("live");

  // A tapped card button is the customer's line "Tapped: <title>" with `tap`, as any turn (a dry run: nothing is booked).
  const send = (line = draft, tap?: "book" | "change") => {
    const text = line.trim();
    if (text === "" || pending) return;
    const next: Entry[] = [...entries, { from: "customer", text }];
    setEntries(next);
    setDraft("");
    one.mutate(
      { messages: linesOf(next), state, prompt, chatId, ...(tap === undefined ? {} : { tap }) },
      {
        onSuccess: (answer) => {
          setEntries((shown) => [...shown, { from: "agent", answer, prompt }]);
          setState(answer.state);
        },
      },
    );
  };
  const reset = () => {
    setEntries([]);
    setState(null);
    setChatId(crypto.randomUUID());
    setDraft("");
    one.reset();
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
        <FormField label={t("prompt")} hint={t("draftHint")} className="sm:max-w-xs">
          {(links) => (
            <Select
              value={prompt}
              disabled={pending}
              onValueChange={(chosen) => {
                const found = oneTestPrompts.find((one) => one === chosen);
                if (found !== undefined) setPrompt(found);
              }}
            >
              <SelectTrigger {...links} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {oneTestPrompts.map((one) => (
                  <SelectItem key={one} value={one}>
                    {t(`prompts.${one}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        {entries.length > 0 && (
          <ol aria-label={t("thread")} className="flex flex-col gap-2 rounded-lg bg-chat-wallpaper p-4">
            {entries.map((entry, index) => {
              // The chat only grows, and Start again empties it: a line's place is its identity.
              if (entry.from === "agent") {
                const latest = index === entries.length - 1 && !pending;
                return (
                  <TestNaturalTurn
                    key={index}
                    answer={entry.answer}
                    prompt={entry.prompt}
                    {...(latest
                      ? {
                          onTap: (button: "book" | "change", title: string) => {
                            send(t("card.tapped", { title }), button);
                          },
                        }
                      : {})}
                  />
                );
              }
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
        <RefusalAlert error={one.error} />
      </CardContent>
    </Card>
  );
}
