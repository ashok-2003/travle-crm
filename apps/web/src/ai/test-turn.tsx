"use client";

// One answer in the Try it chat: the words the customer would get, in our green bubble on the right; a line of its own,
// never an error, when it would hand the chat over, send nothing, or be stopped by a check; and "Why", closed until
// opened.
import type { TestAiAnswer } from "@travel-crm/contracts/ai";
import { ChevronDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TestWhy } from "./test-why";

/** The check's reasons the screen has words for; any other reads as a plain safety check. */
const blockedReasons = [
  "amount",
  "date",
  "place",
  "payment_claim",
  "team_claim",
  "payment_detail",
  "unfit",
  // The lite agent's booking refusals, from the same checks the live turn runs.
  "PAYMENT_DETAILS_MISSING",
  "PACKAGE_NOT_SELLABLE",
  "AI_ACTION_REFUSED",
] as const;
type BlockedReason = (typeof blockedReasons)[number] | "other";
const reasonOf = (code: string): BlockedReason => blockedReasons.find((known) => known === code) ?? "other";

/** Why nothing would be sent, that a person would take the chat, or that the turn would send nothing at all. */
function TurnStatus({ answer }: { answer: TestAiAnswer }) {
  const t = useTranslations("ai.test");
  const { blocked } = answer.dryRun;
  if (blocked !== null) {
    return (
      <p className="text-caption text-status-attention-ink">
        {t("blocked", { reason: t(`blockedReasons.${reasonOf(blocked)}`) })}
      </p>
    );
  }
  if (answer.handoff) {
    return (
      <p className="text-caption text-status-attention-ink">
        {t("handoff", { reason: answer.reason === "" ? t("noReason") : answer.reason })}
      </p>
    );
  }
  if (answer.answer === "") return <p className="text-caption text-muted-foreground">{t("noAnswer")}</p>;
  return null;
}

export function TestTurn({ answer }: { answer: TestAiAnswer }) {
  const t = useTranslations("ai.test");
  const [open, setOpen] = useState(false);
  return (
    <li className="flex flex-col items-end gap-1">
      {answer.answer !== "" && (
        <p className="max-w-[85%] rounded-lg rounded-tr-none bg-chat-bubble-out px-3 py-2 whitespace-pre-line wrap-anywhere">
          <span className="sr-only">{t("agent")} </span>
          {answer.answer}
        </p>
      )}
      <TurnStatus answer={answer} />
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
            <CardContent>
              <TestWhy answer={answer} />
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}
