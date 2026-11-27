"use client";

// The Filters every trip list shares (bookings revamp, 2026-11-27; Bookings and Quotes): the travel dates from and until
// (either or both, the until not before the from), the salesperson for a member who sees everyone's, and one more select
// a list may add (Bookings' payment), in the shared Filters dialog (table-filters.tsx). The days are checked before
// anything applies; Clear all lets every filter go. What is applied shows as chips over the rows (useTripChips), each
// letting its filter go.
import type { LeadWorker } from "@travel-crm/contracts/crm";
import { calendarDate } from "@travel-crm/contracts/kernel";
import { useTranslations } from "next-intl";
import type { RefObject } from "react";
import type { AppliedFilter } from "@/components/data-table/applied-filters";
import { TableFilters, type TableFiltersWords } from "@/components/data-table/table-filters";
import { DateField } from "@/components/date-field";
import type { Checked } from "@/components/forms/checked";
import { SelectField } from "@/components/forms/select-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { formatCalendarDay } from "@/lib/format";

export interface TripFilters {
  travelFrom?: string | undefined;
  travelTo?: string | undefined;
  ownerUserId?: string | undefined;
  /** The list's own select's value (Bookings' payment state). */
  choice?: string | undefined;
}

/** Every filter let go, each named, so applying it over the address clears them all. */
export const noTripFilters = {
  travelFrom: undefined,
  travelTo: undefined,
  ownerUserId: undefined,
  choice: undefined,
} satisfies Record<keyof TripFilters, undefined>;

/** The salespeople to choose from, as their query has them. */
export interface Salespeople {
  data: LeadWorker[] | undefined;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

/** One more select a list adds: its label, its "any" option, and its options. */
export interface TripChoice {
  label: string;
  anyLabel: string;
  options: readonly { value: string; label: string }[];
}

const ANY = "any";

interface FilterValues {
  from: string;
  to: string;
  salesperson: string;
  choice: string;
}

type Problem = "notADay" | "toBeforeFrom";

/** A day as typed: none, the day, or null for text that isn't one. */
const dayOf = (text: string) => (text === "" ? undefined : calendarDate.safeParse(text).success ? text : null);

function checkFilters(values: FilterValues): Checked<FilterValues, TripFilters, Problem> {
  const [from, to] = [dayOf(values.from), dayOf(values.to)];
  if (from === null || to === null) {
    return {
      ok: false,
      problems: { ...(from === null && { from: "notADay" }), ...(to === null && { to: "notADay" }) },
    };
  }
  if (from !== undefined && to !== undefined && to < from) return { ok: false, problems: { to: "toBeforeFrom" } };
  const chosen = (value: string) => (value === ANY ? undefined : value);
  return {
    ok: true,
    input: { travelFrom: from, travelTo: to, ownerUserId: chosen(values.salesperson), choice: chosen(values.choice) },
  };
}

function TripFiltersForm({
  formId,
  filters,
  salespeople,
  choice,
  onApply,
}: {
  formId: string;
  filters: TripFilters;
  salespeople: Salespeople | null;
  choice: TripChoice | undefined;
  onApply: (filters: TripFilters) => void;
}) {
  const t = useTranslations("common.tripFilters");
  const { form, onSubmit } = useCheckedForm<FilterValues, TripFilters, Problem>(
    {
      from: filters.travelFrom ?? "",
      to: filters.travelTo ?? "",
      salesperson: filters.ownerUserId ?? ANY,
      choice: filters.choice ?? ANY,
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
      {choice !== undefined && (
        <SelectField
          control={control}
          name="choice"
          label={choice.label}
          options={[{ value: ANY, label: choice.anyLabel }, ...choice.options]}
        />
      )}
    </form>
  );
}

/**
 * The travel dates' and the salesperson's words when applied ("Travel 1 Dec to 31 Dec", "Salesperson: Ravi Kumar"), as
 * their chips say them and an export's "What it holds" too; null for each not applied.
 */
export function useTripWords(): (
  filters: TripFilters,
  salespersonName: string | null | undefined,
) => { travel: string | null; salesperson: string | null } {
  const t = useTranslations("common.tripFilters.applied");
  const day = (date: string) => formatCalendarDay(date);
  return ({ travelFrom, travelTo, ownerUserId }, salespersonName) => ({
    travel:
      travelFrom !== undefined && travelTo !== undefined
        ? t("travel", { from: day(travelFrom), to: day(travelTo) })
        : travelFrom !== undefined
          ? t("travelFrom", { from: day(travelFrom) })
          : travelTo !== undefined
            ? t("travelTo", { to: day(travelTo) })
            : null,
    salesperson: ownerUserId === undefined ? null : t("salesperson", { name: salespersonName ?? t("someone") }),
  });
}

/** The travel dates and the salesperson, when applied, as chips that each let their filter go. */
export function useTripChips(
  filters: TripFilters,
  salespeople: LeadWorker[] | undefined,
  onApply: (filters: TripFilters) => void,
): AppliedFilter[] {
  const words = useTripWords();
  const name = salespeople?.find((person) => person.userId === filters.ownerUserId)?.name;
  const { travel, salesperson } = words(filters, name);
  const without = (left: TripFilters) => () => {
    onApply({ ...filters, ...left });
  };
  return [
    ...(travel === null ? [] : [{ label: travel, onRemove: without({ travelFrom: undefined, travelTo: undefined }) }]),
    ...(salesperson === null ? [] : [{ label: salesperson, onRemove: without({ ownerUserId: undefined }) }]),
  ];
}

export function TripFiltersDialog({
  filters,
  chosen,
  salespeople,
  choice,
  opener,
  words,
  onApply,
}: {
  filters: TripFilters;
  /** How many chips the applied filters make. */
  chosen: number;
  /** The salespeople to choose from; null for a member who sees only their own. */
  salespeople: Salespeople | null;
  choice?: TripChoice;
  /** The Filters button, which takes the focus back when the dialog closes or a chip goes. */
  opener: RefObject<HTMLButtonElement | null>;
  words: TableFiltersWords;
  onApply: (filters: TripFilters) => void;
}) {
  return (
    <TableFilters
      chosen={chosen}
      opener={opener}
      words={words}
      onClear={() => {
        onApply(noTripFilters);
      }}
    >
      {(form) => (
        <TripFiltersForm
          formId={form.id}
          filters={filters}
          salespeople={salespeople}
          choice={choice}
          onApply={(next) => {
            onApply(next);
            form.done();
          }}
        />
      )}
    </TableFilters>
  );
}
