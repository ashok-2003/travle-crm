// The AI's answer about what changed in a trip, read leniently: a change that doesn't fit its shape is dropped, never
// guessed at, and only the first MAX_PACKAGE_CHANGES are read; code then builds every value from the cited lines.
import {
  answeredPackageChange,
  MAX_PACKAGE_CHANGES,
  packageChangesAnswer,
  type AnsweredPackageChange,
} from "@travel-crm/contracts/ai";

export type AnsweredChange = AnsweredPackageChange;
/** One kind of answered change. */
export type AnsweredOf<Kind extends AnsweredChange["kind"]> = Extract<AnsweredChange, { kind: Kind }>;

export interface ChangesAnswer extends Omit<ReturnType<typeof packageChangesAnswer.parse>, "changes"> {
  changes: AnsweredChange[];
}

/** The answer as data, its changes that fit their shape kept; null when it isn't a JSON object at all. */
export function parseChangesAnswer(value: unknown): ChangesAnswer | null {
  const parsed = packageChangesAnswer.safeParse(value);
  if (!parsed.success) return null;
  return {
    ...parsed.data,
    changes: parsed.data.changes
      .flatMap((one) => {
        const kept = answeredPackageChange.safeParse(one);
        return kept.success ? [kept.data] : [];
      })
      .slice(0, MAX_PACKAGE_CHANGES),
  };
}
