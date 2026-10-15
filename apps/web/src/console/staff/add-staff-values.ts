// The add form's values, as text, turned into the api's input (addPlatformStaffInput, whose own schema decides what is
// valid: a name, a real address, a level), each problem named for the field it belongs to.
import {
  addPlatformStaffInput,
  type AddPlatformStaffInput,
  type PlatformStaffLevel,
} from "@travel-crm/contracts/platform";

export interface AddStaffValues {
  name: string;
  email: string;
  level: PlatformStaffLevel;
}

/** Message keys in the "consolePlatform.staff.addForm.problems" namespace. */
export type AddStaffProblem = "nameRequired" | "emailInvalid";

const problemOf = { name: "nameRequired", email: "emailInvalid" } as const;

const isField = (value: unknown): value is keyof typeof problemOf => value === "name" || value === "email";

export function toAddStaffInput(
  values: AddStaffValues,
):
  | { ok: true; input: AddPlatformStaffInput }
  | { ok: false; problems: Partial<Record<keyof typeof problemOf, AddStaffProblem>> } {
  const parsed = addPlatformStaffInput.safeParse(values);
  if (parsed.success) return { ok: true, input: parsed.data };
  const problems: Partial<Record<keyof typeof problemOf, AddStaffProblem>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (isField(field)) problems[field] = problemOf[field];
  }
  return { ok: false, problems };
}
