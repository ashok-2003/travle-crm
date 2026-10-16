// The add form's values, as text, turned into the api's input (addPlatformStaffInput, whose own schema decides what is
// valid: a name, a real address, a level), each problem named for the field it belongs to.
import {
  addPlatformStaffInput,
  type AddPlatformStaffInput,
  type PlatformStaffLevel,
} from "@travel-crm/contracts/platform";
import { checked, type Checked } from "@/components/forms/checked";

export interface AddStaffValues {
  name: string;
  email: string;
  level: PlatformStaffLevel;
}

/** Message keys in the "consolePlatform.staff.addForm.problems" namespace. */
export type AddStaffProblem = "required" | "nameInvalid" | "emailInvalid";

export function toAddStaffInput(
  values: AddStaffValues,
): Checked<AddStaffValues, AddPlatformStaffInput, AddStaffProblem> {
  return checked(
    addPlatformStaffInput.safeParse(values),
    values,
    ([key]) => (key === "name" || key === "email" ? key : undefined),
    (field) => (field === "name" ? "nameInvalid" : "emailInvalid"),
  );
}
