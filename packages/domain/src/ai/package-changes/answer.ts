// The AI's answer about what changed in a trip, read leniently: a change that doesn't fit its shape is dropped, never
// guessed at; code then builds every value from the cited lines (ground.ts).
import { answeredPackageChange, packageChangesAnswer, type AnsweredPackageChange } from "@travel-crm/contracts/ai";

export type AnsweredChange = AnsweredPackageChange;

export interface ChangesAnswer extends Omit<ReturnType<typeof packageChangesAnswer.parse>, "changes"> {
  changes: AnsweredChange[];
}

/** The answer as data, its changes that fit their shape kept; null when it isn't a JSON object at all. */
export function parseChangesAnswer(value: unknown): ChangesAnswer | null {
  const parsed = packageChangesAnswer.safeParse(value);
  if (!parsed.success) return null;
  return {
    ...parsed.data,
    changes: parsed.data.changes.flatMap((one) => {
      const kept = answeredPackageChange.safeParse(one);
      return kept.success ? [kept.data] : [];
    }),
  };
}
