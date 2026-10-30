"use client";

// A booking's costs on its quote page (step 6, P0), for whoever keeps the accounts: what the agency pays its suppliers
// (the hotel, the cab, the flights), each owed until marked paid; and what is left of the price before GST, its profit
// and margin. Shown only with accounts:view, on a plan with accounts.
import type { TripCost } from "@travel-crm/contracts/finance";
import { CheckIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { RefusalAlert } from "@/components/refusal-alert";
import { StatusBadge } from "@/components/status-badge";
import { rupees } from "@/components/forms/money-field";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { formatCalendarDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useHolds } from "@/session/me-context";
import { isOnPlan } from "@/shell/navigation";
import { useSubscription } from "@/subscription/use-subscription";
import { marginText } from "./bookings-table";
import { AddCostDialog } from "./finance-dialogs";
import { useBookingCosts, useFinanceChanges, useToday } from "./use-finance";

function CostRow({ cost, mayEdit, onVoid }: { cost: TripCost; mayEdit: boolean; onVoid: () => void }) {
  const t = useTranslations("finance.costs");
  const tCategory = useTranslations("finance.costForm.categories");
  const { markCostPaid } = useFinanceChanges();
  const today = useToday();
  return (
    <Item size="sm">
      <ItemContent>
        <ItemTitle>{cost.supplier}</ItemTitle>
        <ItemDescription>
          {[
            tCategory(cost.category),
            cost.paidOn === null
              ? cost.dueOn === null
                ? ""
                : t("dueOn", { day: formatCalendarDay(cost.dueOn) })
              : t("paidOn", { day: formatCalendarDay(cost.paidOn) }),
            cost.note,
          ]
            .filter((part) => part !== "")
            .join(" · ")}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <span className="numbers">{rupees(cost.amountPaise)}</span>
        {cost.paidOn === null ? (
          mayEdit ? (
            <Button
              variant="outline"
              disabled={markCostPaid.isPending}
              onClick={() => {
                markCostPaid.mutate({ tripCostId: cost.id, paidOn: today });
              }}
            >
              <CheckIcon aria-hidden="true" />
              {t("markPaid")}
            </Button>
          ) : (
            <StatusBadge tone="attention">{t("owed")}</StatusBadge>
          )
        ) : (
          <StatusBadge tone="good">{t("paid")}</StatusBadge>
        )}
        {mayEdit && (
          <Button variant="ghost" size="icon" aria-label={t("voidNamed", { supplier: cost.supplier })} onClick={onVoid}>
            <Trash2Icon aria-hidden="true" />
          </Button>
        )}
      </ItemActions>
    </Item>
  );
}

function Costs({ quoteId }: { quoteId: string }) {
  const t = useTranslations("finance.costs");
  const mayAdd = useHolds("accounts:create");
  const mayEdit = useHolds("accounts:edit");
  const costs = useBookingCosts(quoteId);
  const { voidCost, markCostPaid } = useFinanceChanges();
  const [voiding, setVoiding] = useState<string | null>(null);
  const data = costs.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("title")}</h2>
        </CardTitle>
        {mayAdd && (
          <CardAction>
            <AddCostDialog owner={{ quoteId }} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {data === undefined ? (
          costs.isError && (
            <LoadFailedAlert message={t("loadFailed")} error={costs.error} onRetry={() => void costs.refetch()} />
          )
        ) : (
          <>
            <dl className="grid grid-cols-3 gap-3">
              <div className="flex flex-col">
                <dt className="text-caption text-muted-foreground">{t("revenue")}</dt>
                <dd className="numbers font-semibold">{rupees(data.revenuePaise)}</dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-caption text-muted-foreground">{t("cost")}</dt>
                <dd className="numbers font-semibold">{rupees(data.costPaise)}</dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-caption text-muted-foreground">{t("profit")}</dt>
                {/* With no cost yet the whole price would read as profit: a dash until one is entered. */}
                <dd
                  className={cn(
                    "numbers font-semibold",
                    data.costs.length > 0 && (data.profitPaise < 0 ? "text-status-bad-ink" : "text-status-good-ink"),
                  )}
                >
                  {data.costs.length === 0 ? (
                    "—"
                  ) : (
                    <>
                      {rupees(data.profitPaise)}{" "}
                      <span className="text-caption font-normal">{marginText(data.marginBasisPoints)}</span>
                    </>
                  )}
                </dd>
              </div>
            </dl>
            <RefusalAlert error={markCostPaid.error} />
            {data.costs.length === 0 ? (
              <p className="text-muted-foreground">{t("none")}</p>
            ) : (
              <ItemGroup>
                {data.costs.map((cost) => (
                  <CostRow
                    key={cost.id}
                    cost={cost}
                    mayEdit={mayEdit}
                    onVoid={() => {
                      setVoiding(cost.id);
                    }}
                  />
                ))}
              </ItemGroup>
            )}
          </>
        )}
        <ConfirmDialog
          open={voiding !== null}
          onOpenChange={(next) => {
            if (!next) setVoiding(null);
          }}
          title={t("voidTitle")}
          description={t("voidDescription")}
          action={t("void")}
          request={voidCost}
          onConfirm={() => {
            if (voiding === null) return;
            voidCost.mutate(
              { tripCostId: voiding },
              {
                onSuccess: () => {
                  setVoiding(null);
                },
              },
            );
          }}
        />
      </CardContent>
    </Card>
  );
}

export function BookingCostsCard({ quoteId }: { quoteId: string }) {
  const modules = useSubscription().data?.modules;
  const shown = useHolds("accounts:view") && isOnPlan({ module: "accounts" }, modules);
  return shown ? <Costs quoteId={quoteId} /> : null;
}
