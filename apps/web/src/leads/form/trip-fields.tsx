"use client";

// The trip (spec 3.2): the destination from the agency's list (a new name is added), when, who travels, the budget,
// where they leave from, the trip type, the hotel category and food (radio choices), and the room type. Every one can
// wait. The new-lead form and the trip editor share these fields; `disabled` holds the selects while a save is out.
import { foodPreferences, hotelCategories, tripTypes } from "@travel-crm/contracts/crm";
import { useTranslations } from "next-intl";
import type { UseFormReturn } from "react-hook-form";
import { ChoiceField } from "@/components/forms/choice-field";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { BudgetField } from "./budget-field";
import { DestinationField } from "./destination-field";
import type { LeadFormValues } from "./lead-form-values";
import { TravellersField } from "./travellers-field";
import { NOT_ASKED } from "./trip-values";
import { WhenField } from "./when-field";

export function TripFields({ form, disabled = false }: { form: UseFormReturn<LeadFormValues>; disabled?: boolean }) {
  const t = useTranslations("leads");
  const words = useTranslations("leads.form.trip");
  const { control } = form;
  const notAsked = { value: NOT_ASKED, label: words("notAsked") };
  return (
    <>
      <DestinationField control={control} name="destination" label={words("destination")} allowNew />
      <WhenField form={form} disabled={disabled} />
      <TravellersField form={form} disabled={disabled} />
      <BudgetField form={form} disabled={disabled} />
      <TextField control={control} name="departureCity" label={words("departureCity")} autoComplete="off" />
      <SelectField
        control={control}
        name="tripType"
        label={words("tripType")}
        disabled={disabled}
        options={[notAsked, ...tripTypes.map((kind) => ({ value: kind, label: t(`tripTypes.${kind}`) }))]}
      />
      <ChoiceField
        control={control}
        name="hotelCategory"
        legend={words("hotelCategory")}
        inline
        options={[
          notAsked,
          ...hotelCategories.map((category) => ({ value: category, label: t(`hotelCategories.${category}`) })),
        ]}
      />
      <ChoiceField
        control={control}
        name="food"
        legend={words("food")}
        inline
        options={[notAsked, ...foodPreferences.map((food) => ({ value: food, label: t(`food.${food}`) }))]}
      />
      <TextField
        control={control}
        name="roomType"
        label={words("roomType")}
        hint={words("roomTypeHint")}
        autoComplete="off"
      />
    </>
  );
}
