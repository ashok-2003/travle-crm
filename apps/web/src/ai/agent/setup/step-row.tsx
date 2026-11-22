"use client";

// One row of the AI agent's Setup: the step, what it stands at, its state, and one button of one kind: Set up while it
// is to do, Edit (an editor opens below the row) or Manage (its own page: AI settings, WhatsApp, Packages) once done.
import type { AgentSetup } from "@travel-crm/contracts/ai";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { routes } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { AdsStepEditor } from "./ads-step";
import { AnswersStepEditor } from "./answers-step";
import { BasicsStepEditor } from "./basics-step";
import { PaymentStepEditor } from "./payment-step";

export type Step = AgentSetup["steps"][number];
export type StepKey = Step["key"];

/** The steps done on a page of their own. */
const pages: Partial<Record<StepKey, string>> = {
  ai: routes.aiSettings,
  whatsapp: routes.whatsapp,
  packages: routes.packages,
};

/** The steps done here, in an editor under the row. */
const editors: Partial<Record<StepKey, () => ReactNode>> = {
  payment: () => <PaymentStepEditor />,
  answers: () => <AnswersStepEditor />,
  basics: () => <BasicsStepEditor />,
  ads: () => <AdsStepEditor />,
};

function StateLine({ step, mayManage }: { step: Step; mayManage: boolean }) {
  const t = useTranslations("aiAgent.setup.steps");
  if (step.key === "payment" && !mayManage) return <>{t(step.done ? "payment.done" : "payment.askManager")}</>;
  const { count, total } = step;
  if (step.key === "packages" && !step.done && total !== null && total > 0) return <>{t("packages.needsPayment")}</>;
  if (step.key === "packages" && step.done && count !== null) return <>{t("packages.count", { count })}</>;
  if (step.key === "answers" && count !== null && total !== null) return <>{t("answers.count", { count, total })}</>;
  if (step.key === "ads") {
    return <>{total === null || total === 0 ? t("ads.none") : t("ads.count", { count: count ?? 0, total })}</>;
  }
  return <>{t(step.done ? `${step.key}.done` : `${step.key}.todo`)}</>;
}

export function StepRow({ step, open, onToggle }: { step: Step; open: boolean; onToggle: () => void }) {
  const t = useTranslations("aiAgent.setup");
  const id = useId();
  const mayManage = useHolds("settings:manage");
  const title = t(`steps.${step.key}.title`);
  const tone: StatusTone = step.done ? "good" : step.optional ? "neutral" : "attention";
  const page = pages[step.key];
  const editor = editors[step.key];
  // The payment details are the settings managers' alone.
  const editable = editor !== undefined && (step.key !== "payment" || mayManage);
  const action = open ? "close" : step.done ? (page === undefined ? "edit" : "manage") : "setUp";
  const words = t(`actions.${action}`);
  const named = t(`actions.${action}Named`, { title });
  return (
    <>
      <Item>
        {/* On a phone the words take the row, and the state and the button go under them. */}
        <ItemContent className="basis-full sm:basis-0">
          <ItemTitle>{title}</ItemTitle>
          <ItemDescription>
            <StateLine step={step} mayManage={mayManage} />
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <StatusBadge tone={tone}>{t(step.done ? "done" : step.optional ? "optional" : "todo")}</StatusBadge>
          {page !== undefined && (
            <Button variant="outline" asChild>
              <Link href={page} aria-label={named}>
                {words}
              </Link>
            </Button>
          )}
          {editable && (
            <Button variant="outline" aria-expanded={open} aria-controls={id} aria-label={named} onClick={onToggle}>
              {words}
            </Button>
          )}
        </ItemActions>
      </Item>
      {open && editable && (
        <div id={id} className="px-4 pb-4">
          {editor()}
        </div>
      )}
    </>
  );
}
