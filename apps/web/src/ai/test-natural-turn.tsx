"use client";

// One answer of the agent in the Try it chat: up to two messages in our green bubbles; then the agency's payment
// lines, the offer card and the trip menu, which code (never the model) would send after them, each as a bubble of its
// own under a caption; a line of its own when it would hand the chat over, stay quiet or leave it to the team (a task);
// and "Why", closed until opened.
import type { NaturalTestAnswer, OneTestPrompt } from "@travel-crm/contracts/ai";
import { ChevronDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { WhatsAppText } from "@/inbox/whatsapp-text";
import { actionOf } from "./test-natural-actions";
import { TestNaturalWhy } from "./test-natural-why";

/** Our green bubble on the right: what would go to the customer. */
function OutBubble({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-[85%] rounded-lg rounded-tr-none bg-chat-bubble-ai px-3 py-2 wrap-anywhere">{children}</div>
  );
}

/** "Why" under an answer, closed until opened, its parts in a card. */
function WhyToggle({ children }: { children: ReactNode }) {
  const t = useTranslations("ai.test");
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex w-full flex-col items-end gap-1">
      <CollapsibleTrigger asChild>
        <Button variant="ghost">
          {t("why.open")}
          <ChevronDownIcon
            aria-hidden="true"
            data-icon="inline-end"
            className="motion-safe:transition-transform data-[open=true]:rotate-180"
            data-open={open}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="w-full">
        <Card size="sm">
          <CardContent>{children}</CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * What else the turn would do with the chat: couldn't answer (a task, nothing sent), a hand-over (under that too, when
 * the fallback hands the chat over, so it shows at a glance that a person would take it), staying quiet, or nothing.
 */
function NaturalStatus({ answer }: { answer: NaturalTestAnswer }) {
  const t = useTranslations("ai.test");
  const attention = "text-caption text-status-attention-ink";
  const quiet = actionOf(answer.actions, "stay_quiet");
  const handOver = actionOf(answer.actions, "hand_over");
  const handOverLine = handOver && (
    <p className={attention}>{t("handoff", { reason: t(`natural.handOverReasons.${handOver.reason}`) })}</p>
  );
  if (answer.outcome === "fallback") {
    return (
      <>
        <p className={attention}>{t("natural.fallback")}</p>
        {handOverLine}
      </>
    );
  }
  if (handOverLine) return handOverLine;
  if (quiet !== undefined) {
    return <p className="text-caption text-muted-foreground">{t("natural.quiet", { reason: quiet.reason })}</p>;
  }
  if (answer.messages.length === 0) return <p className="text-caption text-muted-foreground">{t("noAnswer")}</p>;
  return null;
}

/** The offer card the turn would send; the latest answer's buttons can be tapped (`onTap`), an earlier one's are not. */
function TestCard({
  card,
  onTap,
}: {
  card: NonNullable<NaturalTestAnswer["card"]>;
  onTap: ((button: "book" | "change", title: string) => void) | undefined;
}) {
  const t = useTranslations("ai.test.card");
  return (
    <>
      <p className="text-caption text-muted-foreground">{t("caption")}</p>
      <OutBubble>
        <WhatsAppText text={card.body} />
      </OutBubble>
      <div className="flex flex-wrap justify-end gap-2">
        {card.buttons.map((title, index) => (
          <Button
            key={title}
            type="button"
            variant="outline"
            disabled={onTap === undefined}
            onClick={() => {
              onTap?.(index === 0 ? "book" : "change", title);
            }}
          >
            {title}
          </Button>
        ))}
      </div>
    </>
  );
}

/** The trip menu the turn would send: its line, then the rows its button opens, each with the line under it. */
function TestMenu({ menu }: { menu: NonNullable<NaturalTestAnswer["menu"]> }) {
  const t = useTranslations("ai.test.menu");
  return (
    <>
      <p className="text-caption text-muted-foreground">{t("caption", { button: menu.button })}</p>
      <OutBubble>
        <WhatsAppText text={menu.body} />
      </OutBubble>
      <ol aria-label={menu.button} className="flex max-w-[85%] flex-col items-end gap-1 text-right">
        {menu.rows.map((row, index) => (
          // The rows never change: a row's place is its identity.
          <li key={index}>
            {row.title}
            {row.description !== undefined && (
              <span className="block text-caption text-muted-foreground">{row.description}</span>
            )}
          </li>
        ))}
      </ol>
    </>
  );
}

/** `prompt` is the prompt the turn was asked to run, which "Why" holds against the one it ran. */
export function TestNaturalTurn({
  answer,
  prompt,
  onTap,
}: {
  answer: NaturalTestAnswer;
  prompt: OneTestPrompt;
  onTap?: (button: "book" | "change", title: string) => void;
}) {
  const t = useTranslations("ai.test");
  const payment = answer.payment ?? [];
  return (
    <li className="flex flex-col items-end gap-1">
      {answer.messages.map((message, index) => (
        // A turn's messages never change: a message's place is its identity.
        <OutBubble key={index}>
          <span className="sr-only">{t("agent")} </span>
          <WhatsAppText text={message} />
        </OutBubble>
      ))}
      {payment.length > 0 && (
        <>
          <p className="text-caption text-muted-foreground">{t("natural.payment")}</p>
          <OutBubble>
            {payment.map((line, index) => (
              // The agency's lines, in their order: a line's place is its identity.
              <span key={index} className="block">
                {line}
              </span>
            ))}
          </OutBubble>
        </>
      )}
      {answer.card && <TestCard card={answer.card} onTap={onTap} />}
      {answer.menu && <TestMenu menu={answer.menu} />}
      <NaturalStatus answer={answer} />
      <WhyToggle>
        <TestNaturalWhy answer={answer} prompt={prompt} />
      </WhyToggle>
    </li>
  );
}
