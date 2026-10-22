// The settings form's values and the api's input for them (spec 3.2): text fields start empty when not set, and the
// contract's own checks (https links, lengths) decide what Save may send.
import {
  saveWebsiteFormInput,
  type FieldMode,
  type SaveWebsiteFormInput,
  type WebsiteFormSettings,
} from "@travel-crm/contracts/website-forms";
import { checked } from "@/components/forms/checked";

export interface FormValues {
  allowEmbed: boolean;
  emailMode: FieldMode;
  destinationMode: FieldMode;
  travelMonthMode: FieldMode;
  travellersMode: FieldMode;
  budgetMode: FieldMode;
  messageMode: FieldMode;
  offersTickbox: boolean;
  heading: string;
  introduction: string;
  thankYouMessage: string;
  websiteUrl: string;
  websiteButtonText: string;
  privacyUrl: string;
}

export type FormProblem = "link" | "tooLong";

export function valuesOf(settings: WebsiteFormSettings): FormValues {
  return {
    allowEmbed: settings.allowEmbed,
    emailMode: settings.emailMode,
    destinationMode: settings.destinationMode,
    travelMonthMode: settings.travelMonthMode,
    travellersMode: settings.travellersMode,
    budgetMode: settings.budgetMode,
    messageMode: settings.messageMode,
    offersTickbox: settings.offersTickbox,
    heading: settings.heading ?? "",
    introduction: settings.introduction ?? "",
    thankYouMessage: settings.thankYouMessage ?? "",
    websiteUrl: settings.websiteUrl ?? "",
    websiteButtonText: settings.websiteButtonText ?? "",
    privacyUrl: settings.privacyUrl ?? "",
  };
}

const links: ReadonlySet<string> = new Set(["websiteUrl", "privacyUrl"]);
const isField = (values: FormValues, key: PropertyKey): key is keyof FormValues =>
  typeof key === "string" && key in values;

/** The api's input for the values, or the problem on each field the contract refused. */
export function checkValues(values: FormValues) {
  return checked<FormValues, SaveWebsiteFormInput, FormProblem>(
    saveWebsiteFormInput.safeParse(values),
    values,
    ([key]) => (key !== undefined && isField(values, key) ? key : undefined),
    (field) => (links.has(field) ? "link" : "tooLong"),
  );
}
