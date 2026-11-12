"use client";

// The AI agent's Setup tab: the checklist in the order the api gives, each step with its state and an editor below it
// (one open at a time), then the switch that turns the agent on.
import type { AgentSetup } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { routes } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { AdsStepEditor } from "./setup/ads-step";
import { AnswersStepEditor } from "./setup/answers-step";
import { BasicsStepEditor } from "./setup/basics-step";
import { PaymentStepEditor } from "./setup/payment-step";
import { TurnOnStep } from "./setup/turn-on-step";

type Step = AgentSetup["steps"][number];
type StepKey = Step["key"];

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
  if (step.key === "packages" && step.done && count !== null) return <>{t("packages.count", { count })}</>;
  if (step.key === "answers" && count !== null && total !== null) return <>{t("answers.count", { count, total })}</>;
  if (step.key === "ads") {
    return <>{total === null || total === 0 ? t("ads.none") : t("ads.count", { count: count ?? 0, total })}</>;
  }
  return <>{t(step.done ? `${step.key}.done` : `${step.key}.todo`)}</>;
}

function StepRow({ step, open, onToggle }: { step: Step; open: boolean; onToggle: () => void }) {
  const t = useTranslations("aiAgent.setup");
  const id = useId();
  const mayManage = useHolds("settings:manage");
  const title = t(`steps.${step.key}.title`);
  const tone: StatusTone = step.done ? "good" : step.optional ? "neutral" : "attention";
  const editor = editors[step.key];
  const editable = editor !== undefined && (step.key !== "payment" || mayManage);
  return (
    <>
      <Item>
        <ItemContent>
          <ItemTitle>{title}</ItemTitle>
          <ItemDescription>
            <StateLine step={step} mayManage={mayManage} />
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <StatusBadge tone={tone}>{t(step.done ? "done" : step.optional ? "optional" : "todo")}</StatusBadge>
          {step.key === "whatsapp" && <TextLink href={routes.whatsapp}>{t("steps.whatsapp.open")}</TextLink>}
          {step.key === "packages" && <TextLink href={routes.packages}>{t("steps.packages.open")}</TextLink>}
          {editable && (
            <Button
              variant="outline"
              aria-expanded={open}
              aria-controls={id}
              aria-label={t(open ? "closeNamed" : "editNamed", { title })}
              onClick={onToggle}
            >
              {t(open ? "close" : "edit")}
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

export function AgentSetupTab({ setup }: { setup: AgentSetup }) {
  const [openKey, setOpenKey] = useState<StepKey | null>(null);
  return (
    <ItemGroup>
      {setup.steps.map((step) => (
        <div key={step.key}>
          <StepRow
            step={step}
            open={openKey === step.key}
            onToggle={() => {
              setOpenKey(openKey === step.key ? null : step.key);
            }}
          />
          <ItemSeparator />
        </div>
      ))}
      <Item>
        <ItemContent>
          <TurnOnStep ready={setup.ready} on={setup.on} pausedBySupport={setup.pausedBySupport} />
        </ItemContent>
      </Item>
    </ItemGroup>
  );
}
