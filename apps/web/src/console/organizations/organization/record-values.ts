// The correction form's values, as text, turned into organizations.update's input by the api's own schema
// (updateOrganizationInput); a blank contact email is none. Each problem is named on its field.
import { updateOrganizationInput, type UpdateOrganizationInput } from "@travel-crm/contracts/platform";

export interface RecordValues {
  name: string;
  timeZone: string;
  contactEmail: string;
}

export type RecordField = keyof RecordValues;

/** Message keys in "consoleOrganizations.record.problems". */
export type RecordProblem = "required" | "nameInvalid" | "emailInvalid" | "timeZoneInvalid";

const problemOf: Record<RecordField, RecordProblem> = {
  name: "nameInvalid",
  timeZone: "timeZoneInvalid",
  contactEmail: "emailInvalid",
};

const isField = (value: unknown): value is RecordField => typeof value === "string" && Object.hasOwn(problemOf, value);

export function toUpdateInput(
  organizationId: string,
  values: RecordValues,
): { ok: true; input: UpdateOrganizationInput } | { ok: false; problems: Partial<Record<RecordField, RecordProblem>> } {
  const parsed = updateOrganizationInput.safeParse({
    organizationId,
    name: values.name,
    timeZone: values.timeZone,
    contactEmail: values.contactEmail.trim() === "" ? null : values.contactEmail,
  });
  if (parsed.success) return { ok: true, input: parsed.data };
  const problems: Partial<Record<RecordField, RecordProblem>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (!isField(field) || problems[field] !== undefined) continue;
    problems[field] = field !== "contactEmail" && values[field].trim() === "" ? "required" : problemOf[field];
  }
  return { ok: false, problems };
}
