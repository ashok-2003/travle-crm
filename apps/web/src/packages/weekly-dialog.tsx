"use client";

// The weekly rule's dialog: the weekdays and months the trip's new departures appear on, saved through packages.updatePart.
import type { PackageDetail } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { useState, type RefObject } from "react";
import { toast } from "sonner";
import { RefusalAlert } from "@/components/refusal-alert";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MONTHS, WEEKDAYS } from "./group-fields";
import { usePackageChanges } from "./use-packages";

const numbers = (picked: string[]) => picked.map(Number).sort((a, b) => a - b);

export function WeeklyDialog({
  detail,
  open,
  onOpenChange,
  opener,
}: {
  detail: PackageDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opener: RefObject<HTMLButtonElement | null>;
}) {
  const t = useTranslations("packages.departuresCalendar.repeats");
  const tWeekdays = useTranslations("packages.form.weekdays");
  const tMonths = useTranslations("packages.form.months");
  const { updatePart } = usePackageChanges();
  const [days, setDays] = useState(detail.weeklyDays.map(String));
  const [months, setMonths] = useState(detail.departureMonths.map(String));
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={updatePart.isPending}
      title={t("changeTitle")}
      description={t("changeDescription")}
      returnFocusTo={opener}
      footer={
        <Button
          disabled={days.length === 0 || updatePart.isPending}
          onClick={() => {
            updatePart.mutate(
              { packageId: detail.id, weeklyDays: numbers(days), departureMonths: numbers(months) },
              {
                onSuccess: () => {
                  toast.success(t("saved"));
                  onOpenChange(false);
                },
              },
            );
          }}
        >
          {t("save")}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <FieldSet>
          <FieldLegend variant="label">{t("weekdays")}</FieldLegend>
          <ToggleGroup
            type="multiple"
            variant="outline"
            spacing={1}
            className="flex-wrap"
            value={days}
            onValueChange={setDays}
          >
            {WEEKDAYS.map((value) => (
              <ToggleGroupItem key={value} value={value}>
                {tWeekdays(value)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {days.length === 0 && <p className="text-caption text-muted-foreground">{t("needDay")}</p>}
        </FieldSet>
        <FieldSet>
          <FieldLegend variant="label">{t("months")}</FieldLegend>
          <p className="text-caption text-muted-foreground">{t("monthsHint")}</p>
          <ToggleGroup
            type="multiple"
            variant="outline"
            spacing={1}
            className="flex-wrap"
            value={months}
            onValueChange={setMonths}
          >
            {MONTHS.map((value) => (
              <ToggleGroupItem key={value} value={value}>
                {tMonths(value)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </FieldSet>
        <RefusalAlert error={updatePart.error} />
      </div>
    </ResponsiveDialog>
  );
}
