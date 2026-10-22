// The visitor's answers as typed, and their check into the api's body by its own schema (websiteEnquiryInput), keeping to
// the fields the agency turned on. A blank required answer is "required"; any other refusal is named on its field.
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import type { formBudgetBases } from "@travel-crm/contracts/website-forms";
import {
  MAX_ENQUIRY_MESSAGE,
  websiteEnquiryInput,
  type PublicForm,
  type WebsiteEnquiryInput,
} from "@travel-crm/contracts/website-forms";
import { checked, type Checked, type Problems } from "@/components/forms/checked";

export const SOMEWHERE_ELSE = "else";
export const FLEXIBLE = "flexible";
export const NOT_SURE = "unsure";
export const MOST_ADULTS = 20;
export const MOST_CHILDREN = 10;
export const MAX_MESSAGE = MAX_ENQUIRY_MESSAGE;

export interface FormValues {
  name: string;
  phone: string;
  email: string;
  /** "" until chosen, a destination's id, or SOMEWHERE_ELSE. */
  destination: string;
  typedDestination: string;
  /** "" until chosen, a month "2026-12", FLEXIBLE or NOT_SURE. */
  travelMonth: string;
  adults: number;
  /** One age per child, "" until chosen. */
  childrenAges: string[];
  budget: string;
  budgetBasis: (typeof formBudgetBases)[number];
  message: string;
  offers: boolean;
  /** The honeypot (W36): a person never fills it. */
  homepage: string;
}

export type FormProblem =
  "required" | "name" | "phone" | "email" | "destination" | "budget" | "message" | "childAge" | "adults";

export function emptyFormValues(): FormValues {
  return {
    name: "",
    phone: "",
    email: "",
    destination: "",
    typedDestination: "",
    travelMonth: "",
    adults: 2,
    childrenAges: [],
    budget: "",
    budgetBasis: "everyone",
    message: "",
    offers: false,
    homepage: "",
  };
}

/** Where a visitor's enquiry is made and sent from: what the body carries besides the answers. */
export interface EnquiryContext {
  form: PublicForm;
  submissionId: string;
  via: WebsiteEnquiryInput["via"];
}

const blank = (text: string) => text.trim() === "";

/** What the agency made required and the visitor left empty, before the api is asked. */
function missingAnswers({ fields }: PublicForm, values: FormValues): Problems<FormValues, FormProblem> {
  const missing: Problems<FormValues, FormProblem> = {};
  if (fields.email === "required" && blank(values.email)) missing.email = "required";
  if (fields.destination === "required") {
    if (values.destination === "") missing.destination = "required";
    else if (values.destination === SOMEWHERE_ELSE && blank(values.typedDestination))
      missing.typedDestination = "required";
  }
  if (fields.travelMonth === "required" && values.travelMonth === "") missing.travelMonth = "required";
  if (fields.budget === "required" && blank(values.budget)) missing.budget = "required";
  if (fields.message === "required" && blank(values.message)) missing.message = "required";
  return missing;
}

/** The budget as whole rupees, or null when it is not an amount in whole rupees. */
function wholeRupees(text: string): number | null {
  const paise = paiseFromRupeesText(text);
  return paise === null || paise % 100 !== 0 ? null : paise / 100;
}

function answersOf(form: PublicForm, values: FormValues, found: Problems<FormValues, FormProblem>) {
  const { fields } = form;
  const answers: Record<string, unknown> = { name: values.name, phone: values.phone };
  if (fields.email !== "off" && !blank(values.email)) answers.email = values.email.trim();
  if (fields.destination !== "off" && values.destination !== "") {
    answers.destination =
      values.destination === SOMEWHERE_ELSE
        ? { kind: "typed", text: values.typedDestination }
        : { kind: "existing", destinationId: values.destination };
  }
  if (fields.travelMonth !== "off" && values.travelMonth !== "") {
    answers.travelMonth = values.travelMonth === NOT_SURE ? null : values.travelMonth;
  }
  if (fields.travellers !== "off") {
    answers.adults = values.adults;
    if (values.childrenAges.some(blank)) found.childrenAges = "childAge";
    answers.childrenAges = values.childrenAges.map(Number);
  }
  if (fields.budget !== "off" && !blank(values.budget)) {
    const rupees = wholeRupees(values.budget);
    if (rupees === null) found.budget = "budget";
    else answers.budget = { rupees, basis: values.budgetBasis };
  }
  if (fields.message !== "off" && !blank(values.message)) answers.message = values.message;
  // An unticked box records nothing (spec 4.3).
  if (form.offersTickbox && values.offers) answers.offers = true;
  return answers;
}

function fieldAt(path: readonly PropertyKey[]): keyof FormValues | undefined {
  const [part, key, detail] = path.map(String);
  if (part !== "answers") return part === "homepage" ? "homepage" : undefined;
  if (key === "destination") return detail === "text" ? "typedDestination" : "destination";
  if (key === "budget") return "budget";
  if (key === "name" || key === "phone" || key === "email" || key === "travelMonth") return key;
  if (key === "adults" || key === "childrenAges" || key === "message") return key;
  return undefined;
}

function problemOf(field: keyof FormValues): FormProblem {
  switch (field) {
    case "name":
    case "phone":
    case "email":
    case "budget":
    case "message":
    case "adults":
      return field;
    case "destination":
    case "typedDestination":
      return "destination";
    case "childrenAges":
      return "childAge";
    default:
      return "required";
  }
}

/** The values as the api's body, or each field's problem. */
export function toEnquiryInput(
  values: FormValues,
  { form, submissionId, via }: EnquiryContext,
): Checked<FormValues, WebsiteEnquiryInput, FormProblem> {
  const found: Problems<FormValues, FormProblem> = missingAnswers(form, values);
  const raw = {
    submissionId,
    openedToken: form.openedToken,
    via,
    homepage: values.homepage,
    answers: answersOf(form, values, found),
  };
  return checked(websiteEnquiryInput.safeParse(raw), values, fieldAt, problemOf, found);
}
