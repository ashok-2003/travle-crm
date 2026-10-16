// The policy form's values, as text, turned into the api's input: three whole numbers of days, checked by the api's
// own schema (setSubscriptionPolicyInput), each problem on its field.
import { checked, type Checked } from "@/components/forms/checked";
import { setSubscriptionPolicyInput, type SubscriptionPolicy } from "@travel-crm/contracts/subscriptions";

export type PolicyField = keyof SubscriptionPolicy;
export type PolicyValues = Record<PolicyField, string>;

const isField = (value: unknown): value is PolicyField =>
  value === "trialDays" || value === "pastDueDays" || value === "readOnlyDays";

export function policyValues(policy: SubscriptionPolicy): PolicyValues {
  return {
    trialDays: String(policy.trialDays),
    pastDueDays: String(policy.pastDueDays),
    readOnlyDays: String(policy.readOnlyDays),
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
  });
  return checked(
    parsed,
    values,
    ([key]) => (isField(key) ? key : undefined),
    (field) => field,
  );
}
