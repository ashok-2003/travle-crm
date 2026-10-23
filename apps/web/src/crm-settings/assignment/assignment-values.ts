// What the assignment screen holds while it is being edited (release 4), and how it turns into what the api saves:
// the plain fields as a react-hook-form's values, the pool, the days and the rules as the screen's own state.
import {
  assignmentModes,
  saveAssignmentInput,
  type AssignmentMode,
  type AssignmentSettings,
  type SaveAssignmentInput,
} from "@travel-crm/contracts/crm";
import { checked, type Checked } from "@/components/forms/checked";
import type { RuleDraft } from "./rule-row";

/** The days of the week in the order of the api's bits: Monday is 1, Sunday 64. */
export const weekdays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof weekdays)[number];

export const OFF = "off";

/** The fields the screen's form holds: times as the time box reads them, the wait as a choice or OFF. */
export interface AssignmentValues {
  mode: string;
  opens: string;
  closes: string;
  slowReply: string;
}

/** What the screen holds outside the form. */
export interface AssignmentExtras {
  pool: ReadonlySet<string>;
  workdays: number;
  rules: readonly RuleDraft[];
}

export type AssignmentProblem = "required" | "closing";

let nextKey = 0;
export const newRuleKey = () => `rule-${String((nextKey += 1))}`;

/** Minutes into the day as the time box writes them: 570 is "09:30" (the end of the day, 1440, shows as 23:59). */
export function timeText(minute: number): string {
  const shown = Math.min(minute, 1439);
  return `${String(Math.floor(shown / 60)).padStart(2, "0")}:${String(shown % 60).padStart(2, "0")}`;
}

function minuteOf(text: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  return match === null ? null : Number(match[1]) * 60 + Number(match[2]);
}

export const dayBit = (day: Weekday) => 1 << weekdays.indexOf(day);

export function valuesOf(settings: AssignmentSettings): AssignmentValues {
  return {
    mode: settings.mode,
    opens: timeText(settings.opensMinute),
    closes: timeText(settings.closesMinute),
    slowReply: settings.slowReplyMinutes === null ? OFF : String(settings.slowReplyMinutes),
  };
}

export function extrasOf(settings: AssignmentSettings): AssignmentExtras {
  return {
    pool: new Set(settings.pool.map((member) => member.userId)),
    workdays: settings.workdays,
    rules: settings.rules.map((rule): RuleDraft => ({
      key: newRuleKey(),
      source: rule.source,
      destination: rule.destinationId === null ? null : { id: rule.destinationId, name: rule.destinationName ?? "" },
      tripType: rule.tripType,
      assigneeUserId: rule.assigneeUserId,
    })),
  };
}

/** Whether each rule has a person and at least one condition. */
export const rulesComplete = (rules: readonly RuleDraft[]) =>
  rules.every(
    (rule) =>
      rule.assigneeUserId !== null && (rule.source !== null || rule.destination !== null || rule.tripType !== null),
  );

/** The form's values and the screen's other state, checked by the api's own schema. */
export function toSaveInput(
  values: AssignmentValues,
  extras: AssignmentExtras,
): Checked<AssignmentValues, SaveAssignmentInput, AssignmentProblem> {
  const opens = minuteOf(values.opens);
  const closes = minuteOf(values.closes);
  const mode = assignmentModes.find((each): each is AssignmentMode => each === values.mode);
  const raw = {
    mode,
    slowReplyMinutes: values.slowReply === OFF ? null : Number(values.slowReply),
    workdays: extras.workdays,
    opensMinute: opens,
    closesMinute: closes,
    pool: [...extras.pool],
    rules: extras.rules.flatMap((rule) =>
      rule.assigneeUserId === null
        ? []
        : [
            {
              source: rule.source,
              destinationId: rule.destination?.id ?? null,
              tripType: rule.tripType,
              assigneeUserId: rule.assigneeUserId,
            },
          ],
    ),
  };
  const fields: Record<string, keyof AssignmentValues> = {
    mode: "mode",
    opensMinute: "opens",
    closesMinute: "closes",
    slowReplyMinutes: "slowReply",
  };
  return checked(
    saveAssignmentInput.safeParse(raw),
    values,
    ([key]) => fields[String(key)],
    () => "closing",
    {
      ...(opens === null ? { opens: "required" as const } : {}),
      ...(closes === null ? { closes: "required" as const } : {}),
    },
  );
}
