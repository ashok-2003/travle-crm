"use client";

// The Bookings list's Filters (bookings revamp, 2026-11-27): a button saying how many filters narrow the list, and its
// dialog (a sheet on phones) with the travel dates (from and until, either or both), the salesperson for a member who sees
// every booking, and the payment (paid in full, part paid, nothing received, overdue). Show bookings puts them in the
// address, Clear all lets them go; the status chips and the search stay as they are. What is applied shows as chips over
// the rows (appliedChips), each letting its filter go.
import { bookingPaymentStates, type BookingPaymentState } from "@travel-crm/contracts/bookings";
import type { LeadWorker } from "@travel-crm/contracts/crm";
import { calendarDate } from "@travel-crm/contracts/kernel";
import { SlidersHorizontalIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type RefObject } from "react";
import type { AppliedFilter } from "@/components/data-table/applied-filters";
import { DateField } from "@/components/date-field";
import type { Checked } from "@/components/forms/checked";
import { SelectField } from "@/components/forms/select-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { formatCalendarDay } from "@/lib/format";
import type { BookingsAddress } from "./list-address";
import type { useBookingSalespeople } from "./use-bookings";

const ANY = "any";

/** What Filters sets: the travel dates, the salesperson and the payment. */
export type BookingFilters = Pick<BookingsAddress, "travelFrom" | "travelTo" | "ownerUserId" | "payment">;

interface FilterValues {
  from: string;
  to: string;
  salesperson: string;
  payment: BookingPaymentState | typeof ANY;
}

type Problem = "notADay" | "toBeforeFrom";

/** A day as typed: none, the day, or null for text that isn't one. */
const dayOf = (text: string) => (text === "" ? undefined : calendarDate.safeParse(text).success ? text : null);

function checkFilters(values: FilterValues): Checked<FilterValues, BookingFilters, Problem> {
  const [from, to] = [dayOf(values.from), dayOf(values.to)];
  if (from === null || to === null) {
    return {
      ok: false,
      problems: { ...(from === null && { from: "notADay" }), ...(to === null && { to: "notADay" }) },
    };
  }
  if (from !== undefined && to !== undefined && to < from) return { ok: false, problems: { to: "toBeforeFrom" } };
  return {
    ok: true,
    input: {
      travelFrom: from,
      travelTo: to,
      ownerUserId: values.salesperson === ANY ? undefined : values.salesperson,
      payment: values.payment === ANY ? undefined : values.payment,
    },
  };
}

function FiltersForm({
  formId,
  filters,
  salespeople,
  onApply,
}: {
  formId: string;
  filters: BookingFilters;
  /** The salespeople to choose from; none for a member who sees only their own bookings. */
  salespeople: ReturnType<typeof useBookingSalespeople> | null;
  onApply: (filters: BookingFilters) => void;
}) {
  const t = useTranslations("bookings.list.filtersDialog");
  const { form, onSubmit } = useCheckedForm<FilterValues, BookingFilters, Problem>(
    {
      from: filters.travelFrom ?? "",
      to: filters.travelTo ?? "",
      salesperson: filters.ownerUserId ?? ANY,
      payment: filters.payment ?? ANY,
    },
    checkFilters,
    (problem) => t(`problems.${problem}`),
  );
  const { control } = form;
  return (
    <form id={formId} noValidate className="flex flex-col gap-6" onSubmit={onSubmit(onApply)}>
      <div className="grid gap-6 sm:grid-cols-2">
        <DateField control={control} name="from" label={t("travelFrom")} />
        <DateField control={control} name="to" label={t("travelTo")} />
      </div>
      {salespeople !== null && (
        <>
          <SelectField
            control={control}
            name="salesperson"
            label={t("salesperson")}
            options={[
              { value: ANY, label: t("anyone") },
              ...(salespeople.data ?? []).map((person) => ({ value: person.userId, label: person.name })),
            ]}
          />
          {salespeople.isError && (
            <LoadFailedAlert
              message={t("salespeopleFailed")}
              error={salespeople.error}
              onRetry={() => void salespeople.refetch()}
            />
          )}
        </>
      )}
      <SelectField
        control={control}
        name="payment"
        label={t("payment")}
        options={[
          { value: ANY, label: t("anyPayment") },
          ...bookingPaymentStates.map((state) => ({ value: state, label: t(`payments.${state}`) })),
        ]}
      />
    </form>
  );
}

/** The applied filters as chips, each letting its own go. */
export function useAppliedChips(
  filters: BookingFilters,
  salespeople: LeadWorker[] | undefined,
  onApply: (filters: BookingFilters) => void,
): AppliedFilter[] {
  const t = useTranslations("bookings.list");
  const { travelFrom, travelTo, ownerUserId, payment } = filters;
  const day = (date: string) => formatCalendarDay(date);
  const travel =
    travelFrom !== undefined && travelTo !== undefined
      ? t("applied.travel", { from: day(travelFrom), to: day(travelTo) })
      : travelFrom !== undefined
        ? t("applied.travelFrom", { from: day(travelFrom) })
        : travelTo !== undefined
          ? t("applied.travelTo", { to: day(travelTo) })
          : null;
  const chips: AppliedFilter[] = [];
  const without = (left: Partial<BookingFilters>) => () => {
    onApply({ ...filters, ...left });
  };
  if (travel !== null) chips.push({ label: travel, onRemove: without({ travelFrom: undefined, travelTo: undefined }) });
  if (ownerUserId !== undefined) {
    const name = salespeople?.find((person) => person.userId === ownerUserId)?.name ?? t("applied.someone");
    chips.push({ label: t("applied.salesperson", { name }), onRemove: without({ ownerUserId: undefined }) });
  }
  if (payment !== undefined) {
    const state = t(`filtersDialog.payments.${payment}`);
    chips.push({ label: t("applied.payment", { state }), onRemove: without({ payment: undefined }) });
  }
  return chips;
}

export function BookingsFilters({
  filters,
  chosen,
  salespeople,
  opener,
  onApply,
}: {
  filters: BookingFilters;
  /** How many chips the applied filters make. */
  chosen: number;
  salespeople: ReturnType<typeof useBookingSalespeople> | null;
  /** The Filters button, which takes the focus back when the dialog closes or a chip goes. */
  opener: RefObject<HTMLButtonElement | null>;
  onApply: (filters: BookingFilters) => void;
}) {
  const t = useTranslations("bookings.list");
  const [open, setOpen] = useState(false);
  const formId = useId();
  const apply = (next: BookingFilters) => {
    onApply(next);
    setOpen(false);
  };
  return (
    <>
      <Button
        ref={opener}
        variant="outline"
        aria-label={chosen > 0 ? t("filtersChosen", { count: chosen }) : undefined}
        onClick={() => {
          setOpen(true);
        }}
      >
        <SlidersHorizontalIcon aria-hidden="true" />
        {t("filtersButton")}
        {chosen > 0 && <span className="numbers">{chosen}</span>}
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        returnFocusTo={opener}
        title={t("filtersDialog.title")}
        description={t("filtersDialog.description")}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                apply({});
              }}
            >
              {t("filtersDialog.clear")}
            </Button>
            <Button type="submit" form={formId}>
              {t("filtersDialog.apply")}
            </Button>
          </>
        }
      >
        {open && <FiltersForm formId={formId} filters={filters} salespeople={salespeople} onApply={apply} />}
      </ResponsiveDialog>
    </>
  );
}
