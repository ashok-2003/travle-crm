// The policy form's values, as text, turned into the api's input: three whole numbers of days, checked by the api's
// own schema (setSubscriptionPolicyInput), each problem on its field.
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

/** The input, or the fields whose days aren't allowed (each field's message names its range). */
export function toPolicyInput(
  values: PolicyValues,
): { ok: true; input: SubscriptionPolicy } | { ok: false; problems: PolicyField[] } {
  const parsed = setSubscriptionPolicyInput.safeParse({
    trialDays: daysOf(values.trialDays),
    pastDueDays: daysOf(values.pastDueDays),
    readOnlyDays: daysOf(values.readOnlyDays),
  });
  if (parsed.success) return { ok: true, input: parsed.data };
  const problems = parsed.error.issues.map((issue) => issue.path[0]).filter(isField);
  return { ok: false, problems: [...new Set(problems)] };
}
