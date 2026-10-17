// The lead form's values as typed, and their check into the api's input by its own schema (createLeadInput): only a
// name and one contact are needed. Every lead form holds these values (the new lead, and the trip and person editors,
// each sending its own part), so the fields are shared without a second copy. A refused value is named on its field.
import { createLeadInput, type CreateLeadInput, type HandLeadSource } from "@travel-crm/contracts/crm";
import { checked, type Checked } from "@/components/forms/checked";
import { emptyTripValues, textOrNull, tripInputOf, tripProblems, type TripValues } from "./trip-values";

export interface PersonValues {
  name: string;
  phone: string;
  email: string;
  instagramHandle: string;
}

export interface LeadFormValues extends PersonValues, TripValues {
  /** Becomes the lead's first timeline note. */
  note: string;
  source: HandLeadSource;
  sourceDetail: string;
  ownerUserId: string;
  /** What to do when the person has an open lead (R24): "" until the form asks. */
  whenOpenLead: "" | "add-to-it" | "new-lead";
}

/** A problem on one of the form's fields: a message key in the form's "problems". */
export type LeadFormProblem =
  | "required"
  | "name"
  | "contact"
  | "phone"
  | "email"
  | "instagramHandle"
  | "destination"
  | "from"
  | "to"
  | "month"
  | "adults"
  | "childAge"
  | "budget"
  | "tooLong"
  | "note";

export const emptyPersonValues: PersonValues = { name: "", phone: "", email: "", instagramHandle: "" };

/** A new lead's form: nothing typed, from a phone call, owned by whoever adds it. */
export function emptyLeadValues(myUserId: string): LeadFormValues {
  return {
    ...emptyPersonValues,
    ...emptyTripValues,
    note: "",
    source: "phone_call",
    sourceDetail: "",
    ownerUserId: myUserId,
    whenOpenLead: "",
  };
}

/** The person as the api's newPerson takes them: the contacts typed, the rest left out. */
export function personInputOf(values: PersonValues) {
  const contact = (text: string) => textOrNull(text) ?? undefined;
  const [phone, email, instagramHandle] = [
    contact(values.phone),
    contact(values.email),
    contact(values.instagramHandle),
  ];
  return {
    name: values.name,
    ...(phone !== undefined && { phone }),
    ...(email !== undefined && { email }),
    ...(instagramHandle !== undefined && { instagramHandle }),
  };
}

/** What the person's fields lack before the api is asked: a name, and any one contact. */
export function personProblems(values: PersonValues) {
  const blank = (text: string) => text.trim() === "";
  const noContact = blank(values.phone) && blank(values.email) && blank(values.instagramHandle);
  return {
    ...(blank(values.name) && { name: "name" as const }),
    ...(noContact && { phone: "contact" as const }),
  };
}

const personFields = new Set<string>(["name", "phone", "email", "instagramHandle"]);
const tripTextFields = new Set<string>(["adults", "departureCity", "roomType", "tripType", "hotelCategory", "food"]);

/**
 * The field a refused place in createLeadInput, editTripInput or editPersonInput belongs to: ["person", "phone"] is
 * the phone, ["trip", "when", "to"] the last day, ["trip", "budget", ...] the budget.
 */
export function leadFieldAt(path: readonly PropertyKey[]): keyof LeadFormValues | undefined {
  const [part, key, detail] = path.map(String);
  if (part === "person" && key !== undefined && personFields.has(key)) return key as keyof PersonValues;
  if (part === "trip") {
    if (key === "when") return detail === "to" ? "to" : detail === "month" ? "month" : "from";
    if (key === "destination" || key === "budget" || key === "childrenAges") return key;
    if (key !== undefined && tripTextFields.has(key)) return key as keyof TripValues;
  }
  if (part === "note" || part === "sourceDetail" || part === "ownerUserId") return part;
  return undefined;
}

/** A field's problem when it isn't blank (a blank one is "required"). */
export function leadProblemOf(field: keyof LeadFormValues): LeadFormProblem {
  switch (field) {
    case "phone":
    case "email":
    case "instagramHandle":
    case "destination":
    case "to":
    case "month":
    case "adults":
    case "budget":
    case "note":
      return field;
    case "from":
      return "from";
    case "childrenAges":
      return "childAge";
    default:
      return "tooLong";
  }
}

/** The form's values as createLeadInput, or each field's problem. */
export function toCreateLeadInput(
  values: LeadFormValues,
  context: { userId: string },
): Checked<LeadFormValues, CreateLeadInput, LeadFormProblem> {
  const owner = values.ownerUserId;
  const raw = {
    person: personInputOf(values),
    trip: tripInputOf(values),
    note: textOrNull(values.note),
    source: values.source,
    sourceDetail: textOrNull(values.sourceDetail),
    // Whoever adds it is the default owner, and the api's: only someone else is named.
    ownerUserId: owner === "" || owner === context.userId ? null : owner,
    whenOpenLead: values.whenOpenLead === "" ? null : values.whenOpenLead,
  };
  return checked(createLeadInput.safeParse(raw), values, leadFieldAt, leadProblemOf, {
    ...personProblems(values),
    ...tripProblems(values),
  });
}
