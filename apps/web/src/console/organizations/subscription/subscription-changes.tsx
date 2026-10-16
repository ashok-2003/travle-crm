"use client";

// What support may change about a subscription, beside Record a payment: one Change menu (the registry DropdownMenu)
// whose items each open their dialog. First the plan, the seats, price and modules, the trial's end while it lasts,
// and the paid-through day; then, apart and destructive, suspending, lifting a suspension (super admins) and
// cancelling. Each is offered only when the api would take it. The menu holds which dialog is open, so the dialogs
// live outside it and outlast its closing.
import type { OrganizationRecord } from "@travel-crm/contracts/platform";
import type { SubscriptionDetails } from "@travel-crm/contracts/subscriptions";
import { calendarDateIn } from "@travel-crm/domain/kernel";
import { ChevronDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { OpenState } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isSuperAdmin, useStaff } from "../../session/staff-context";
import { ChangePlanDialog } from "./change-plan-dialog";
import { PaidThroughDialog, TrialEndDialog } from "./dates-dialogs";
import { OverridesDialog } from "./overrides-dialog";
import { EndAccessDialog } from "./reason-dialogs";

type Change = "changePlan" | "overrides" | "trialEnd" | "paidThrough" | "suspend" | "liftSuspension" | "cancel";

/**
 * Whether the trial lasts today, as the api decides (subscriptions/paid-dates.ts): by the state due today, which a
 * suspension by hand hides behind "suspended". That state is the trial recorded, until its last day has passed.
 */
function inTrial(subscription: SubscriptionDetails, today: string): boolean {
  if (subscription.manualSuspension === null) return subscription.status === "trial";
  return (
    subscription.recorded.status === "trial" && (subscription.trialEndsOn === null || subscription.trialEndsOn >= today)
  );
}

export function SubscriptionChanges({
  organization,
  subscription,
}: {
  organization: OrganizationRecord;
  subscription: SubscriptionDetails;
}) {
  const t = useTranslations("consoleOrganizations.subscription");
  const staff = useStaff();
  const [opened, setOpened] = useState<Change | null>(null);
  const state = (change: Change): OpenState => ({
    open: opened === change,
    setOpen: (open) => {
      setOpened(open ? change : null);
    },
  });
  const offered = {
    trialEnd: inTrial(subscription, calendarDateIn(new Date(), organization.timeZone)),
    suspend: subscription.manualSuspension === null && subscription.status !== "cancelled",
    liftSuspension: subscription.manualSuspension !== null && isSuperAdmin(staff),
    cancel: subscription.status !== "cancelled",
  };
  const item = (change: Change, destructive = false) => (
    <DropdownMenuItem
      variant={destructive ? "destructive" : "default"}
      onSelect={() => {
        setOpened(change);
      }}
    >
      {t(`${change}.action`)}
    </DropdownMenuItem>
  );
  return (
    <>
      {/* Not modal: the dialog an item opens takes the page over itself. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            {t("change")}
            <ChevronDownIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {item("changePlan")}
          {item("overrides")}
          {offered.trialEnd && item("trialEnd")}
          {item("paidThrough")}
          {(offered.suspend || offered.liftSuspension || offered.cancel) && <DropdownMenuSeparator />}
          {offered.suspend && item("suspend", true)}
          {offered.liftSuspension && item("liftSuspension")}
          {offered.cancel && item("cancel", true)}
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePlanDialog subscription={subscription} state={state("changePlan")} />
      <OverridesDialog subscription={subscription} state={state("overrides")} />
      {offered.trialEnd && <TrialEndDialog subscription={subscription} state={state("trialEnd")} />}
      <PaidThroughDialog subscription={subscription} state={state("paidThrough")} />
      {offered.suspend && <EndAccessDialog subscription={subscription} change="suspend" state={state("suspend")} />}
      {offered.liftSuspension && (
        <EndAccessDialog subscription={subscription} change="liftSuspension" state={state("liftSuspension")} />
      )}
      {offered.cancel && <EndAccessDialog subscription={subscription} change="cancel" state={state("cancel")} />}
    </>
  );
}
