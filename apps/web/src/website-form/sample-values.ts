// What the settings Preview fills the form with (spec 3.4): made-up answers for the questions the agency turned on, so
// the agency sees the form as it looks once a visitor has typed, and the destinations and months are the agency's own.
import type { PublicForm } from "@travel-crm/contracts/website-forms";
import { emptyFormValues, type FormValues } from "./form-values";

export function sampleFormValues({ fields, destinations, destinationInput, months }: PublicForm): FormValues {
  return {
    ...emptyFormValues(),
    name: "Asha Rao",
    phone: "98765 43210",
    email: fields.email === "off" ? "" : "asha@example.com",
    destination: fields.destination === "off" || destinationInput === "typed" ? "" : (destinations[0]?.id ?? ""),
    typedDestination: fields.destination !== "off" && destinationInput === "typed" ? "Spiti Valley" : "",
    travelMonth: fields.travelMonth === "off" ? "" : (months[1] ?? ""),
    budget: fields.budget === "off" ? "" : "60000",
    message: fields.message === "off" ? "" : "We are two adults and would like a quiet week.",
  };
}
