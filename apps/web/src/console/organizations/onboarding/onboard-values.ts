// The onboarding form's values, as text, turned into organizations.onboard's input. The api's own schema
// (onboardOrganizationInput) decides what is valid, a GSTIN of another state included; each problem is named on the
// field it belongs to, so the form shows it there before anything is sent.
import { isValidGstin } from "@travel-crm/contracts/kernel";
import { onboardOrganizationInput, type OnboardOrganizationInput } from "@travel-crm/contracts/platform";

/** How the subscription starts: the policy's usual trial, a trial to a chosen day, or paid through a day already. */
export type SubscriptionStart = "trial" | "trial-until" | "paid";

export interface OnboardValues {
  name: string;
  code: string;
  timeZone: string;
  contactEmail: string;
  legalName: string;
  gstStateCode: string;
  gstin: string;
  contactName: string;
  contactPhone: string;
  ownerName: string;
  ownerEmail: string;
  planId: string;
  billingCycle: string;
  start: SubscriptionStart;
  trialEndsOn: string;
  paidThrough: string;
}

export type OnboardField = keyof OnboardValues;

/** Message keys in "consoleOrganizations.onboard.problems". */
export type OnboardProblem =
  | "required"
  | "codeInvalid"
  | "emailInvalid"
  | "nameInvalid"
  | "gstinInvalid"
  | "gstinOtherState"
  | "phoneInvalid"
  | "timeZoneInvalid"
  | "dateRequired"
  | "dateInvalid";

export function emptyOnboardValues(): OnboardValues {
  return {
    name: "",
    code: "",
    timeZone: "Asia/Kolkata",
    contactEmail: "",
    legalName: "",
    gstStateCode: "",
    gstin: "",
    contactName: "",
    contactPhone: "",
    ownerName: "",
    ownerEmail: "",
    planId: "",
    billingCycle: "",
    start: "trial",
    trialEndsOn: "",
    paidThrough: "",
  };
}

/** The form field each place in the api's input comes from. */
const fieldAt: Record<string, OnboardField> = {
  name: "name",
  code: "code",
  timeZone: "timeZone",
  contactEmail: "contactEmail",
  "profile.legalName": "legalName",
  "profile.gstin": "gstin",
  "profile.gstStateCode": "gstStateCode",
  "profile.contactName": "contactName",
  "profile.contactPhone": "contactPhone",
  "owner.name": "ownerName",
  "owner.email": "ownerEmail",
  "subscription.planId": "planId",
  "subscription.billingCycle": "billingCycle",
  "subscription.trialEndsOn": "trialEndsOn",
  "subscription.paidThrough": "paidThrough",
};

/** What is wrong with a field the schema refused, other than being left blank. */
const problemOf: Record<OnboardField, OnboardProblem> = {
  name: "nameInvalid",
  code: "codeInvalid",
  timeZone: "timeZoneInvalid",
  contactEmail: "emailInvalid",
  legalName: "nameInvalid",
  gstStateCode: "required",
  gstin: "gstinInvalid",
  contactName: "nameInvalid",
  contactPhone: "phoneInvalid",
  ownerName: "nameInvalid",
  ownerEmail: "emailInvalid",
  planId: "required",
  billingCycle: "required",
  start: "required",
  trialEndsOn: "dateInvalid",
  paidThrough: "dateInvalid",
};

/** A blank optional box is no value (ADR 0024's one rule for optional text). */
const optional = (text: string) => (text.trim() === "" ? null : text);

function subscriptionOf(values: OnboardValues) {
  const base = { planId: values.planId, billingCycle: values.billingCycle };
  if (values.start === "trial") return { ...base, paidThrough: null };
  if (values.start === "trial-until") return { ...base, trialEndsOn: values.trialEndsOn, paidThrough: null };
  return { ...base, trialEndsOn: null, paidThrough: values.paidThrough };
}

export function toOnboardInput(
  values: OnboardValues,
):
  | { ok: true; input: OnboardOrganizationInput }
  | { ok: false; problems: Partial<Record<OnboardField, OnboardProblem>> } {
  const problems: Partial<Record<OnboardField, OnboardProblem>> = {};
  // The day a start needs, asked for in words rather than left to the schema's "Use a date like…".
  if (values.start === "trial-until" && values.trialEndsOn === "") problems.trialEndsOn = "dateRequired";
  if (values.start === "paid" && values.paidThrough === "") problems.paidThrough = "dateRequired";
  const parsed = onboardOrganizationInput.safeParse({
    name: values.name,
    code: values.code,
    timeZone: values.timeZone,
    contactEmail: values.contactEmail,
    profile: {
      legalName: values.legalName,
      gstin: optional(values.gstin),
      gstStateCode: values.gstStateCode,
      contactName: optional(values.contactName),
      contactPhone: optional(values.contactPhone),
    },
    owner: { name: values.ownerName, email: values.ownerEmail },
    subscription: subscriptionOf(values),
  });
  if (parsed.success && Object.keys(problems).length === 0) return { ok: true, input: parsed.data };
  for (const issue of parsed.error?.issues ?? []) {
    const field = fieldAt[issue.path.join(".")];
    if (field === undefined || problems[field] !== undefined) continue;
    if (values[field].trim() === "") {
      problems[field] = "required";
    } else if (field === "gstin" && isValidGstin(values.gstin.trim().toUpperCase())) {
      // A well-formed GSTIN refused all the same: the schema's rule that it be of the state chosen.
      problems[field] = "gstinOtherState";
    } else {
      problems[field] = problemOf[field];
    }
  }
  return { ok: false, problems };
}
