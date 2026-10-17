"use client";

// The setup checklist's pieces (spec 7.1), shared by Home's card and the setup screen: how far along it is, and one row
// a step, leading to where it is done (the business profile's section for the details, the contact phone, the bank
// account and the invoice prefix; branding for the logo, the colour and the terms; staff). Where done and to-do steps
// mix, each row says which, as a dot and a word (DESIGN.md).
import type { SetupChecklist, SetupStep } from "@travel-crm/contracts/profile";
import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment, useId } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { Progress } from "@/components/ui/progress";
import { stepScreens } from "./use-setup-checklist";

/** "5 of 7 done", and the bar that shows it. */
export function SetupProgress({ checklist }: { checklist: SetupChecklist }) {
  const t = useTranslations("business.setup");
  const id = useId();
  const done = checklist.steps.filter((step) => step.done).length;
  const total = checklist.steps.length;
  return (
    <div className="flex flex-col gap-2">
      <p id={id} className="text-label text-muted-foreground">
        {t("progress", { done, total })}
      </p>
      <Progress value={(done / total) * 100} aria-labelledby={id} />
    </div>
  );
}

/** A step: what it is and what it needs, with its status if `status`. */
function SetupStepRow({ step, done, status }: { step: SetupStep; done: boolean; status: boolean }) {
  const t = useTranslations("business.setup");
  return (
    <div role="listitem">
      <Item size="sm" asChild>
        <Link href={stepScreens[step].href}>
          <ItemContent>
            <ItemTitle>{t(`steps.${step}.title`)}</ItemTitle>
            <ItemDescription>{t(`steps.${step}.hint`)}</ItemDescription>
          </ItemContent>
          {status && <StatusBadge tone={done ? "good" : "neutral"}>{done ? t("done") : t("toDo")}</StatusBadge>}
          <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0" />
        </Link>
      </Item>
    </div>
  );
}

/** Every step with its status, or (`nextToDo`) at most that many of the steps still to do, which need none. */
export function SetupSteps({ checklist, nextToDo }: { checklist: SetupChecklist; nextToDo?: number }) {
  const toDoOnly = nextToDo !== undefined;
  const steps = toDoOnly ? checklist.steps.filter((step) => !step.done).slice(0, nextToDo) : checklist.steps;
  return (
    <ItemGroup>
      {steps.map(({ step, done }, index) => (
        <Fragment key={step}>
          {index > 0 && <ItemSeparator />}
          <SetupStepRow step={step} done={done} status={!toDoOnly} />
        </Fragment>
      ))}
    </ItemGroup>
  );
}
