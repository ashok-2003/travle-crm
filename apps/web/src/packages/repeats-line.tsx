"use client";

// Under the departures calendar, in plain words: the weekly rule ("Every Friday in Nov, Dec and Jan · new departures
// appear 12 weeks ahead") with Change and Stop, the seats each new departure gets and the advance to hold a seat, each
// changeable in place. All of it is the trip's own fields, saved through packages.updatePart, which also makes or
// cancels the rolling departures; so each needs quotes:edit.
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import type { PackageDetail, UpdatePackagePartInput } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { rupees, rupeesFieldText } from "@/components/forms/money-field";
import { Button } from "@/components/ui/button";
import { useHolds } from "@/session/me-context";
import { monthsInReadingOrder } from "./departure-calendar-days";
import { useChangeGate } from "./departure-edits";
import { MONTHS, useOnlyPackageOnSale, WEEKDAYS } from "./group-fields";
import { InlineValue } from "./inline-value";
import { WeeklyDialog } from "./weekly-dialog";
import { usePackageChanges } from "./use-packages";

const list = (words: string[]) => new Intl.ListFormat("en-IN", { style: "long", type: "conjunction" }).format(words);

export function RepeatsLine({ detail }: { detail: PackageDetail }) {
  const t = useTranslations("packages.departuresCalendar.repeats");
  const tLong = useTranslations("packages.departuresCalendar.weekdaysLong");
  const tMonths = useTranslations("packages.form.months");
  const tForm = useTranslations("packages.form");
  const mayEdit = useHolds("quotes:edit");
  const gate = useChangeGate();
  const { updatePart } = usePackageChanges();
  const onlyOnSale = useOnlyPackageOnSale(detail);
  const [changing, setChanging] = useState(false);
  const [stopping, setStopping] = useState(false);
  // Each opening starts from what is saved: the dialog's picks are its own state, so it is made anew.
  const [round, setRound] = useState(0);
  const changeButton = useRef<HTMLButtonElement>(null);
  const stopButton = useRef<HTMLButtonElement>(null);
  const days = list([...detail.weeklyDays].sort((a, b) => a - b).map((day) => tLong(WEEKDAYS[day] ?? "0")));
  const months = list(monthsInReadingOrder(detail.departureMonths).map((month) => tMonths(MONTHS[month - 1] ?? "1")));
  const rule =
    detail.weeklyDays.length === 0
      ? t("none")
      : detail.departureMonths.length === 0
        ? t("everyAnyMonth", { days })
        : t("every", { days, months });
  const saveField = (fields: Partial<UpdatePackagePartInput>, done: () => void) => {
    updatePart.mutate(
      { packageId: detail.id, ...fields },
      {
        onSuccess: () => {
          toast.success(t("valueSaved"));
          done();
        },
      },
    );
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <p>{rule}</p>
        {mayEdit && (
          <>
            <Button
              ref={changeButton}
              variant="outline"
              aria-label={t("changeTitle")}
              disabled={gate.disabled}
              aria-describedby={gate.describedBy}
              onClick={() => {
                setRound(round + 1);
                setChanging(true);
              }}
            >
              {t("change")}
            </Button>
            {detail.weeklyDays.length > 0 && (
              <Button
                ref={stopButton}
                variant="destructive"
                disabled={gate.disabled}
                aria-describedby={gate.describedBy}
                onClick={() => {
                  setStopping(true);
                }}
              >
                {t("stop")}
              </Button>
            )}
          </>
        )}
        {gate.hint}
      </div>
      <WeeklyDialog key={round} detail={detail} open={changing} onOpenChange={setChanging} opener={changeButton} />
      <ConfirmDialog
        open={stopping}
        onOpenChange={setStopping}
        title={t("stopTitle")}
        description={t("stopDescription")}
        action={t("stopAction")}
        request={updatePart}
        returnFocusTo={stopButton}
        onConfirm={() => {
          updatePart.mutate(
            { packageId: detail.id, weeklyDays: [] },
            {
              onSuccess: () => {
                toast.success(t("stopped"));
                setStopping(false);
              },
            },
          );
        }}
      />
      <InlineValue
        canChange={mayEdit}
        words={detail.seatsPerDeparture === null ? t("seatsNone") : t("seats", { seats: detail.seatsPerDeparture })}
        editLabel={t("editSeats")}
        boxLabel={t("seatsLabel")}
        start={detail.seatsPerDeparture === null ? "" : String(detail.seatsPerDeparture)}
        parse={(text) => {
          const seats = text.trim();
          if (seats === "") return { seatsPerDeparture: null };
          return /^\d{1,4}$/.test(seats) && Number(seats) > 0 ? { seatsPerDeparture: Number(seats) } : null;
        }}
        problem={t("seatsInvalid")}
        save={saveField}
      />
      <InlineValue
        canChange={mayEdit}
        words={
          detail.advancePerPersonPaise === null
            ? t("advanceNone")
            : t("advance", { amount: rupees(detail.advancePerPersonPaise) })
        }
        editLabel={t("editAdvance")}
        boxLabel={t("advanceLabel")}
        start={detail.advancePerPersonPaise === null ? "" : rupeesFieldText(detail.advancePerPersonPaise)}
        parse={(text) => {
          const amount = text.trim();
          if (amount === "") return { advancePerPersonPaise: null };
          const paise = paiseFromRupeesText(amount);
          return paise === null ? null : { advancePerPersonPaise: paise };
        }}
        problem={t("advanceInvalid")}
        hint={onlyOnSale ? tForm("advanceOnlyOnSale") : undefined}
        save={saveField}
      />
    </div>
  );
}
