"use client";

// The two small edits a departure's panel offers: its seats, and a price for it alone. Each opens in place, sends one
// call, and says what the api refused (seats below the booked ones, say) under its box.
import type { CalendarDeparture } from "@travel-crm/contracts/departures";
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import {
  roomTypes,
  type PackageDetail,
  type RoomPrices,
  type RoomType,
  type SeasonColumn,
} from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";
import { RefusalAlert } from "@/components/refusal-alert";
import { rupeesFieldText } from "@/components/forms/money-field";
import { Button } from "@/components/ui/button";
import { useDepartureChanges } from "@/departures/use-departures";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { LabelledInput } from "./labelled-input";

/** The subscription's say on a change: a button's `disabled` and `aria-describedby`, and the hint to render once. */
export function useChangeGate() {
  const access = useWriteAccess("change");
  const hintId = `${useId()}-write`;
  return {
    disabled: !access.allowed,
    describedBy: access.allowed ? undefined : hintId,
    hint: <WriteHint id={hintId} hint={access.hint} />,
  };
}

export function ChangeSeats({ departure }: { departure: CalendarDeparture }) {
  const t = useTranslations("packages.departuresCalendar");
  const gate = useChangeGate();
  const { setSeats } = useDepartureChanges();
  const [typed, setTyped] = useState<string | null>(null);
  const seats = typed?.trim() ?? "";
  const valid = /^\d{1,4}$/.test(seats);
  if (typed === null) {
    return (
      <Button
        variant="outline"
        disabled={gate.disabled}
        aria-describedby={gate.describedBy}
        onClick={() => {
          setTyped(String(departure.seatsTotal));
        }}
      >
        {t("changeSeats")}
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <LabelledInput
        label={t("seatsLabel")}
        value={typed}
        onChange={setTyped}
        problem={seats !== "" && !valid ? t("seatsInvalid") : undefined}
        disabled={setSeats.isPending}
      />
      <RefusalAlert error={setSeats.error} />
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={!valid || gate.disabled || setSeats.isPending}
          aria-describedby={gate.describedBy}
          onClick={() => {
            setSeats.mutate(
              { departureId: departure.departureId, seatsTotal: Number(seats) },
              {
                onSuccess: () => {
                  toast.success(t("seatsSaved"));
                  setTyped(null);
                },
              },
            );
          }}
        >
          {t("seatsSave")}
        </Button>
        <Button
          variant="outline"
          disabled={setSeats.isPending}
          onClick={() => {
            setTyped(null);
          }}
        >
          {t("repeats.cancel")}
        </Button>
      </div>
      {gate.hint}
    </div>
  );
}

export const noPrices: RoomPrices = {
  single: null,
  double: null,
  triple: null,
  quad: null,
  child_bed: null,
  child_no_bed: null,
};

/** A price for this departure only: a box per room the trip sells, the season's price grey in it; an empty box keeps the season's. */
export function OwnPrices({
  detail,
  departure,
  column,
}: {
  detail: PackageDetail;
  departure: CalendarDeparture;
  column: SeasonColumn | undefined;
}) {
  const t = useTranslations("packages.departuresCalendar");
  const tRooms = useTranslations("packages.form.roomTypeNames");
  const gate = useChangeGate();
  const { setPrices } = useDepartureChanges();
  const rooms = roomTypes.filter((room) => detail.roomTypes.includes(room));
  const seasonPrice = (room: RoomType) => column?.prices[room] ?? null;
  const own = (room: RoomType) =>
    departure.ownPrices[room] === null ? "" : rupeesFieldText(departure.ownPrices[room]);
  const [typed, setTyped] = useState<Record<string, string> | null>(null);
  const read = (room: RoomType): { paise: number | null; ok: boolean } => {
    const text = (typed?.[room] ?? "").trim();
    // An empty box is no price of its own: the server then prices the room from the season, room by room.
    if (text === "") return { paise: null, ok: true };
    const paise = paiseFromRupeesText(text);
    return { paise, ok: paise !== null };
  };
  if (typed === null) {
    return (
      <Button
        variant="outline"
        disabled={gate.disabled}
        aria-describedby={gate.describedBy}
        onClick={() => {
          setTyped(Object.fromEntries(rooms.map((room) => [room, own(room)])));
        }}
      >
        {t("ownPrices")}
      </Button>
    );
  }
  const allOk = rooms.every((room) => read(room).ok);
  const save = () => {
    const prices = { ...noPrices, ...Object.fromEntries(rooms.map((room) => [room, read(room).paise])) };
    setPrices.mutate(
      { departureId: departure.departureId, prices },
      {
        onSuccess: () => {
          toast.success(t("ownPricesSaved"));
          setTyped(null);
        },
      },
    );
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground">{t("ownPricesHint")}</p>
      {rooms.map((room) => (
        <LabelledInput
          key={room}
          label={t("roomLabel", { room: tRooms(room) })}
          value={typed[room] ?? ""}
          onChange={(value) => {
            setTyped({ ...typed, [room]: value });
          }}
          placeholder={seasonPrice(room) === null ? "" : rupeesFieldText(seasonPrice(room) ?? 0)}
          problem={read(room).ok ? undefined : t("priceInvalid")}
          disabled={setPrices.isPending}
        />
      ))}
      <RefusalAlert error={setPrices.error} />
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={!allOk || gate.disabled || setPrices.isPending}
          aria-describedby={gate.describedBy}
          onClick={save}
        >
          {t("ownPricesSave")}
        </Button>
        <Button
          variant="outline"
          disabled={setPrices.isPending}
          onClick={() => {
            setTyped(null);
          }}
        >
          {t("repeats.cancel")}
        </Button>
      </div>
      {gate.hint}
    </div>
  );
}
