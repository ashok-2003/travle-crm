"use client";

// One answer of the new agent in the Try it chat: up to two messages in our green bubbles; then the agency's payment
// lines, which code (never the model) would send after them, as a bubble of their own under a caption; a line of its own
// when it would hand the chat over, stay quiet or leave it to the team (a task); and "Why", closed until opened.
import type { NaturalTestAnswer } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { actionOf } from "./test-natural-actions";
import { TestNaturalWhy } from "./test-natural-why";
import { WhatsAppText } from "@/inbox/whatsapp-text";
import { OutBubble, WhyToggle } from "./test-turn";

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

export function TestNaturalTurn({
  answer,
  onTap,
}: {
  answer: NaturalTestAnswer;
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
      <NaturalStatus answer={answer} />
      <WhyToggle>
        <TestNaturalWhy answer={answer} />
      </WhyToggle>
    </li>
  );
}
