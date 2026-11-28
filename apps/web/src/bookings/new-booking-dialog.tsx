"use client";

// New booking from the Bookings list: the quote and the confirmed booking in one step, for a customer who has already said
// yes. A centred popup: the lead first (the New quote popup's step), then the trip (a package, with its departure for a group
// trip, or a trip of its own with a title and date), the people and the total; Create booking opens the booking.
import { createBookingInput, type CreateBookingInput } from "@travel-crm/contracts/bookings";
import type { LeadDetail } from "@travel-crm/contracts/crm";
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { DateField } from "@/components/date-field";
import { checked } from "@/components/forms/checked";
import { FormAlert } from "@/components/forms/form-dialog";
import { MoneyField } from "@/components/forms/money-field";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import type { ReturnFocusTo } from "@/components/return-focus";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useDepartureList } from "@/departures/use-departures";
import { useLead } from "@/leads/lead/use-lead";
import { formatCalendarDay } from "@/lib/format";
import { bookingRoute } from "@/lib/routes";
import { LeadStep } from "@/quotes/lead-step";
import { useQuotePackages, useQuoteSettings } from "@/quotes/use-quotes";
import type { PickedLead } from "@/today/lead-picker";
import { useBookingChanges } from "./use-bookings";

type Problem = "required" | "invalid";
const NO_PACKAGE = "";
const TAX_RATES = [0, 500, 1800] as const;

interface Values {
  packageId: string;
  departureId: string;
  title: string;
  startDate: string;
  adults: string;
  children: string;
  total: string;
  tax: string;
}

const fieldOf: Record<string, keyof Values> = {
  packageId: "packageId",
  departureId: "departureId",
  title: "title",
  startDate: "startDate",
  adults: "adults",
  children: "children",
  totalPaise: "total",
  taxRateBasisPoints: "tax",
};
const whole = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text) : -1);

function BookingForm({
  formId,
  lead,
  create,
}: {
  formId: string;
  lead: LeadDetail;
  create: ReturnType<typeof useBookingChanges>["create"];
}) {
  const t = useTranslations("bookings.list.newBooking");
  const router = useRouter();
  const packages = useQuotePackages();
  const settings = useQuoteSettings();
  const { trip } = lead;
  const initial: Values = {
    packageId: NO_PACKAGE,
    departureId: "",
    title: "",
    startDate: trip.when.kind === "dates" ? trip.when.from : "",
    adults: String(trip.adults ?? 2),
    children: String(trip.childrenAges.length),
    total: "",
    tax: String(settings.data?.defaultTaxRateBasisPoints ?? 500),
  };
  const { form, onSubmit, formProblem } = useCheckedForm<Values, CreateBookingInput, Problem>(
    initial,
    (typed) =>
      checked(
        createBookingInput.safeParse({
          leadId: lead.id,
          packageId: typed.packageId === NO_PACKAGE ? null : typed.packageId,
          departureId: typed.departureId === "" ? null : typed.departureId,
          title: typed.title,
          startDate: typed.startDate === "" ? null : typed.startDate,
          adults: whole(typed.adults),
          children: whole(typed.children),
          totalPaise: paiseFromRupeesText(typed.total) ?? -1,
          taxRateBasisPoints: Number(typed.tax),
        }),
        typed,
        (path) => fieldOf[String(path[0])],
        () => "invalid",
      ),
    () => t("problem"),
  );
  const packageId = form.watch("packageId");
  const chosen = (packages.data ?? []).find((one) => one.id === packageId);
  const departures = useDepartureList("upcoming", chosen?.kind === "group", chosen?.id);
  const open = (departures.data ?? []).filter((one) => one.status === "open" && one.free > 0);
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={onSubmit((input) => {
        create.mutate(input, {
          onSuccess: ({ bookingId }) => {
            router.push(bookingRoute(bookingId));
          },
        });
      })}
    >
      <SelectField
        control={form.control}
        name="packageId"
        label={t("trip")}
        options={[
          { value: NO_PACKAGE, label: t("custom") },
          ...(packages.data ?? []).map((one) => ({ value: one.id, label: one.name })),
        ]}
        onChosen={(id) => {
          const one = (packages.data ?? []).find((candidate) => candidate.id === id);
          form.setValue("departureId", "");
          form.setValue("title", one?.title ?? "");
          if (one !== undefined) form.setValue("tax", String(one.taxRateBasisPoints));
        }}
      />
      {chosen?.kind === "group" && (
        <SelectField
          control={form.control}
          name="departureId"
          label={t("departure")}
          placeholder={t("departureNone")}
          options={open.map((one) => ({ value: one.id, label: `${one.title} · ${formatCalendarDay(one.startDate)}` }))}
          onChosen={(id) => {
            const one = open.find((candidate) => candidate.id === id);
            if (one !== undefined) form.setValue("startDate", one.startDate);
          }}
        />
      )}
      <TextField control={form.control} name="title" label={t("tripTitle")} />
      <DateField control={form.control} name="startDate" label={t("startDate")} />
      <div className="grid grid-cols-2 gap-4">
        <TextField control={form.control} name="adults" label={t("adults")} inputMode="numeric" />
        <TextField control={form.control} name="children" label={t("children")} inputMode="numeric" />
      </div>
      <MoneyField control={form.control} name="total" label={t("total")} hint={t("totalHint")} />
      <SelectField
        control={form.control}
        name="tax"
        label={t("tax")}
        options={TAX_RATES.map((rate) => ({
          value: String(rate),
          label: rate === 0 ? t("taxNone") : `${String(rate / 100)}%`,
        }))}
      />
      <FormAlert sending={create} problem={formProblem} />
    </form>
  );
}

export function NewBookingDialog({
  open,
  onOpenChange,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("bookings.list.newBooking");
  const formId = useId();
  const { create } = useBookingChanges();
  const [picked, setPicked] = useState<PickedLead | null>(null);
  const lead = useLead(picked?.id ?? "", { enabled: picked !== null });
  const busy = create.isPending;
  return (
    <ResponsiveDialog
      centered
      open={open}
      onOpenChange={(next) => {
        if (!next) create.reset();
        onOpenChange(next);
      }}
      busy={busy}
      title={t("title")}
      description={t("description")}
      returnFocusTo={returnFocusTo}
      footer={
        picked !== null && (
          <Button type="submit" form={formId} disabled={busy || lead.data === undefined}>
            {busy && <Spinner />}
            {busy ? t("submitting") : t("submit")}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {picked === null ? (
          <LeadStep onPick={setPicked} />
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <span className="min-w-0 font-medium">{picked.name}</span>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setPicked(null);
                }}
              >
                {t("change")}
              </Button>
            </div>
            {lead.data !== undefined && <BookingForm formId={formId} lead={lead.data} create={create} />}
            {lead.isError && (
              <LoadFailedAlert message={t("loadFailed")} error={lead.error} onRetry={() => void lead.refetch()} />
            )}
          </>
        )}
      </div>
    </ResponsiveDialog>
  );
}
