// The correction form's values, as text, turned into organizations.update's input by the api's own schema
// (updateOrganizationInput); a blank contact email is none. Each problem is named on its field.
import { updateOrganizationInput, type UpdateOrganizationInput } from "@travel-crm/contracts/platform";
import { checked, type Checked } from "@/components/forms/checked";

export interface RecordValues {
  name: string;
  timeZone: string;
  contactEmail: string;
}

type RecordField = keyof RecordValues;

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
): Checked<RecordValues, UpdateOrganizationInput, RecordProblem> {
  const parsed = updateOrganizationInput.safeParse({
    organizationId,
    name: values.name,
    timeZone: values.timeZone,
    contactEmail: values.contactEmail.trim() === "" ? null : values.contactEmail,
  });
  return checked(
    parsed,
    values,
    ([key]) => (isField(key) ? key : undefined),
    (field) => problemOf[field],
  );
}
