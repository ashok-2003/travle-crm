"use client";

// A departure's Costs tab (release 7a), for whoever keeps the accounts: the bookings' price before GST, what those bookings
// cost, what the departure itself costs (the hotel block, the bus: paid once, not split over bookings), and the profit. Each
// departure cost is marked paid or removed here, as a booking's are.
import { CheckIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { RefusalAlert } from "@/components/refusal-alert";
import { rupees } from "@/components/forms/money-field";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { AddCostDialog } from "@/finance/finance-dialogs";
import { marginText } from "@/finance/bookings-table";
import { useFinanceChanges, useToday } from "@/finance/use-finance";
import { formatCalendarDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useHolds } from "@/session/me-context";
import { SectionCard } from "@/bookings/section-card";
import { useDepartureMoney } from "./use-departures";

export function CostsTab({ departureId }: { departureId: string }) {
  const t = useTranslations("departures.costs");
  const tCategory = useTranslations("finance.costForm.categories");
  const mayAdd = useHolds("accounts:create");
  const mayEdit = useHolds("accounts:edit");
  const money = useDepartureMoney(departureId, true);
  const { markCostPaid, voidCost } = useFinanceChanges();
  const today = useToday();
  const [voiding, setVoiding] = useState<string | null>(null);
  const data = money.data;
  const figure = (label: string, value: string, className?: string) => (
    <div className="flex flex-col">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className={cn("numbers font-semibold", className)}>{value}</dd>
    </div>
  );
  return (
    <SectionCard title={t("title")}>
      <p className="text-muted-foreground">{t("intro")}</p>
      {data === undefined ? (
        money.isError && (
          <LoadFailedAlert message={t("loadFailed")} error={money.error} onRetry={() => void money.refetch()} />
        )
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {figure(t("revenue"), rupees(data.revenuePaise))}
            {figure(t("bookingCosts"), rupees(data.bookingCostPaise))}
            {figure(t("departureCosts"), rupees(data.departureCostPaise))}
            <div className="flex flex-col">
              <dt className="text-caption text-muted-foreground">{t("profit")}</dt>
              <dd
                className={cn(
                  "numbers font-semibold",
                  data.bookingCostPaise + data.departureCostPaise > 0 &&
                    (data.profitPaise < 0 ? "text-status-bad-ink" : "text-status-good-ink"),
                )}
              >
                {rupees(data.profitPaise)}{" "}
                <span className="text-caption font-normal">{marginText(data.marginBasisPoints)}</span>
              </dd>
            </div>
          </dl>
          <RefusalAlert error={markCostPaid.error} />
          {data.costs.length === 0 ? (
            <p className="text-muted-foreground">{t("none")}</p>
          ) : (
            <ItemGroup>
              {data.costs.map((cost) => (
                <Item key={cost.id} size="sm" role="listitem">
                  <ItemContent>
                    <ItemTitle>{cost.supplier}</ItemTitle>
                    <ItemDescription>
                      {[
                        tCategory(cost.category as "hotel"),
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
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("voidNamed", { supplier: cost.supplier })}
                        onClick={() => {
                          setVoiding(cost.id);
                        }}
                      >
                        <Trash2Icon aria-hidden="true" />
                      </Button>
                    )}
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          )}
          {mayAdd && (
            <div>
              <AddCostDialog owner={{ departureId }} />
            </div>
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
    </SectionCard>
  );
}
