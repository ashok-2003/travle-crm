// The add-staff form's values, as text, turned into the api's input. The api's own schema (createStaffInput) decides
// what is valid; each problem is named so the form can show its message on the field it belongs to.
import { createStaffInput, type CreateStaffInput } from "@travel-crm/contracts/identity";

export interface CreateStaffValues {
  name: string;
  email: string;
  username: string;
  roleKey: string;
  temporaryPassword: string;
}

export type CreateStaffField = keyof CreateStaffValues;

/** Message keys in the "staff.form" namespace. */
export type CreateStaffProblem =
  "nameRequired" | "emailInvalid" | "usernameInvalid" | "emailOrUsername" | "roleRequired" | "passwordTooShort";

const problemOf: Record<CreateStaffField, CreateStaffProblem> = {
  name: "nameRequired",
  email: "emailInvalid",
  username: "usernameInvalid",
  roleKey: "roleRequired",
  temporaryPassword: "passwordTooShort",
};

const isField = (value: unknown): value is CreateStaffField =>
  typeof value === "string" && Object.hasOwn(problemOf, value);

export function toCreateStaffInput(
  values: CreateStaffValues,
):
  | { ok: true; input: CreateStaffInput }
  | { ok: false; problems: Partial<Record<CreateStaffField, CreateStaffProblem>> } {
  const email = values.email.trim();
  const username = values.username.trim();
  const parsed = createStaffInput.safeParse({
    name: values.name,
    roleKey: values.roleKey,
    temporaryPassword: values.temporaryPassword,
    // A blank field is one the admin left out: staff may have an email, a username or both.
    ...(email === "" ? {} : { email }),
    ...(username === "" ? {} : { username }),
  });
  if (parsed.success) return { ok: true, input: parsed.data };
  const problems: Partial<Record<CreateStaffField, CreateStaffProblem>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (!isField(field) || problems[field] !== undefined) continue;
    // The schema's one cross-field rule (an email or a username) is a custom issue on the username.
    problems[field] = issue.code === "custom" && field === "username" ? "emailOrUsername" : problemOf[field];
  }
  return { ok: false, problems };
}
