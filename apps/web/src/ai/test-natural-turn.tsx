"use client";

// One answer of the new agent in the Try it chat: up to two messages in our green bubbles; then the agency's payment
// lines, which code (never the model) would send after them, as a bubble of their own under a caption; a line of its own
// when it would hand the chat over, stay quiet or send the fallback line; and "Why", closed until opened.
import type { NaturalTestAnswer } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { actionOf } from "./test-natural-actions";
import { TestNaturalWhy } from "./test-natural-why";
import { OutBubble, WhyToggle } from "./test-turn";

/** What else the turn would do with the chat: the fallback line, a hand-over, staying quiet, or nothing at all. */
function NaturalStatus({ answer }: { answer: NaturalTestAnswer }) {
  const t = useTranslations("ai.test");
  const attention = "text-caption text-status-attention-ink";
  const quiet = actionOf(answer.actions, "stay_quiet");
  const handOver = actionOf(answer.actions, "hand_over");
  if (answer.outcome === "fallback") return <p className={attention}>{t("natural.fallback")}</p>;
  if (handOver !== undefined) {
    const reason = t(`natural.handOverReasons.${handOver.reason}`);
    return <p className={attention}>{t("handoff", { reason })}</p>;
  }
  if (quiet !== undefined) {
    return <p className="text-caption text-muted-foreground">{t("natural.quiet", { reason: quiet.reason })}</p>;
  }
  if (answer.messages.length === 0) return <p className="text-caption text-muted-foreground">{t("noAnswer")}</p>;
  return null;
}

export function TestNaturalTurn({ answer }: { answer: NaturalTestAnswer }) {
  const t = useTranslations("ai.test");
  const payment = answer.payment ?? [];
  return (
    <li className="flex flex-col items-end gap-1">
      {answer.messages.map((message, index) => (
        // A turn's messages never change: a message's place is its identity.
        <OutBubble key={index}>
          <span className="sr-only">{t("agent")} </span>
          {message}
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
      <NaturalStatus answer={answer} />
      <WhyToggle>
        <TestNaturalWhy answer={answer} />
      </WhyToggle>
    </li>
  );
}
