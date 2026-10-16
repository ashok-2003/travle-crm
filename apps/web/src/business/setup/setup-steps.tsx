"use client";

// The setup checklist's steps (spec 7.1), each leading to the screen where it is done: the business profile for the
// details, the bank account and the invoice prefix, then branding and staff. Status is a dot and a word (DESIGN.md).
import type { SetupChecklist, SetupStep } from "@travel-crm/contracts/profile";
import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
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
    <ItemGroup>
      {checklist.steps.map(({ step, done }, index) => (
        <Fragment key={step}>
          {index > 0 && <ItemSeparator />}
          <div role="listitem">
            <Item size="sm" asChild>
              <Link href={whereDone[step]}>
                <ItemContent>
                  <ItemTitle>{t(`steps.${step}.title`)}</ItemTitle>
                  <ItemDescription>{t(`steps.${step}.hint`)}</ItemDescription>
                </ItemContent>
                <StatusBadge tone={done ? "good" : "neutral"}>{done ? t("done") : t("toDo")}</StatusBadge>
                <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0" />
              </Link>
            </Item>
          </div>
        </Fragment>
      ))}
    </ItemGroup>
  );
}
