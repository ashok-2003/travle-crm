// The policy form's values, as text, turned into the api's input: three whole numbers of days and the GST on subscriptions (none or 18 %), checked by the api's
// own schema (setSubscriptionPolicyInput), each problem on its field.
import { checked, type Checked } from "@/components/forms/checked";
import { setSubscriptionPolicyInput, type SubscriptionPolicy } from "@travel-crm/contracts/subscriptions";

export type PolicyField = keyof SubscriptionPolicy;
export type PolicyValues = Record<PolicyField, string>;

/** The GST choices as the form holds them: basis points as text. */
export const GST_CHOICES = ["0", "1800"] as const;

const isField = (value: unknown): value is PolicyField =>
  value === "trialDays" ||
  value === "pastDueDays" ||
  value === "readOnlyDays" ||
  value === "subscriptionGstBasisPoints";

export function policyValues(policy: SubscriptionPolicy): PolicyValues {
  return {
    trialDays: String(policy.trialDays),
    pastDueDays: String(policy.pastDueDays),
    readOnlyDays: String(policy.readOnlyDays),
    subscriptionGstBasisPoints: String(policy.subscriptionGstBasisPoints),
  };
}

const daysOf = (text: string) => (/^\d{1,4}$/.test(text.trim()) ? Number(text.trim()) : Number.NaN);

/** Message keys in "consolePlatform.policy.problems": each field's own names its range. */
export type PolicyProblem = PolicyField | "required";

export function toPolicyInput(values: PolicyValues): Checked<PolicyValues, SubscriptionPolicy, PolicyProblem> {
  const parsed = setSubscriptionPolicyInput.safeParse({
    trialDays: daysOf(values.trialDays),
    pastDueDays: daysOf(values.pastDueDays),
    readOnlyDays: daysOf(values.readOnlyDays),
    subscriptionGstBasisPoints: Number(values.subscriptionGstBasisPoints),
  });
  return checked(
    parsed,
    values,
    ([key]) => (isField(key) ? key : undefined),
    (field) => field,
  );
}
