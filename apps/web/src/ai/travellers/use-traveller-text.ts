"use client";

// A proposed or held traveller value in words, the same for both sides of the review: a birth date as "12 Jun 1980", a gender
// and a room request in the form's own words, a passport as its number, dates and country.
import type { FillTraveller } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { formatCalendarDay } from "@/lib/format";
import type { TravellerFieldKey } from "./traveller-fields";

export function useTravellerText(): (key: TravellerFieldKey, value: unknown) => string {
  const form = useTranslations("bookings.travellers.form");
  const t = useTranslations("ai.travellers.values");
  return (key, value) => {
    switch (key) {
      case "dateOfBirth":
        return formatCalendarDay(String(value));
      case "gender":
        return form(`genders.${String(value) as "female"}`);
      case "roomRequest":
        return form(`roomRequests.${String(value) as "none"}`);
      case "identity": {
        if (typeof value === "string") return t("idOnFile");
        const id = value as NonNullable<FillTraveller["identity"]>;
        return [
          t("passport", { number: id.number }),
          id.issuedOn === null ? "" : t("issued", { day: formatCalendarDay(id.issuedOn) }),
          id.expiresOn === null ? "" : t("expires", { day: formatCalendarDay(id.expiresOn) }),
          id.nationality,
        ]
          .filter((part) => part !== "")
          .join(", ");
      }
      default:
        return String(value);
    }
  };
}
