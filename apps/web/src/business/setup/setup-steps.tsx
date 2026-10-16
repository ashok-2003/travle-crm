"use client";

// The setup checklist's steps (spec 7.1), each leading to the screen where it is done: the business profile for the
// details, the bank account and the invoice prefix, then branding and staff. Status is a dot and a word (DESIGN.md).
import type { SetupChecklist, SetupStep } from "@travel-crm/contracts/profile";
import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/status-badge";
import { routes } from "@/lib/routes";

const whereDone: Record<SetupStep, string> = {
  "business-details": routes.profile,
  "bank-details": routes.profile,
  "invoice-prefix": routes.profile,
  branding: routes.branding,
  staff: routes.staff,
};

/** "3 of 5 done". */
export function useSetupProgress() {
  const t = useTranslations("business.setup");
  return (checklist: SetupChecklist) =>
    t("progress", { done: checklist.steps.filter((step) => step.done).length, total: checklist.steps.length });
}

export function SetupSteps({ checklist }: { checklist: SetupChecklist }) {
  const t = useTranslations("business.setup");
  return (
    <ol className="divide-y rounded-lg border">
      {checklist.steps.map(({ step, done }) => (
        <li key={step}>
          <Link href={whereDone[step]} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-accent">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium">{t(`steps.${step}.title`)}</span>
              <span className="text-label text-muted-foreground">{t(`steps.${step}.hint`)}</span>
            </span>
            <StatusBadge tone={done ? "good" : "neutral"}>{done ? t("done") : t("toDo")}</StatusBadge>
            <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ol>
  );
}
