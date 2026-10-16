// A form's values checked by the api's own zod schema, the verdict put in the form's terms: the api's input, or a
// problem (a message key) on each field the schema refused, plus `unplaced` when it refused a place no field maps to.
// A form module writes one `to<Thing>Input(values)` with it and hands that to useCheckedForm (use-checked-form.ts):
//
//   return checked(schema.safeParse(raw), values, ([key]) => fieldOf[String(key)], (field) => problemOf[field]);
//
// `fieldAt` maps a refused path to a field (path.join(".") for nested inputs); `problemOf` names a field's problem
// when it isn't blank (a blank field is always "required"); `found` holds problems known before parsing.
import type { z } from "zod";

/** Each field's problem, a message key in the form's "problems". */
export type Problems<Values, Problem extends string> = Partial<Record<keyof Values & string, Problem>>;

/** A form's values checked: the api's input, or what stops it ("unplaced": a refusal no field explains). */
export type Checked<Values, Input, Problem extends string> =
  { ok: true; input: Input } | { ok: false; problems: Problems<Values, Problem>; unplaced?: true };

/**
 * The schema's verdict as the form's: each refused place put on its field (`fieldAt`), keeping the first problem for
 * each field, those `found` already first. A field left blank is "required"; any other refusal is `problemOf` it. A
 * refused place no field maps to makes the form unplaced, so the form says so rather than send nothing in silence.
 */
export function checked<Values extends object, Input, Problem extends string>(
  parsed: z.ZodSafeParseResult<Input>,
  values: Values,
  fieldAt: (path: readonly PropertyKey[]) => (keyof Values & string) | undefined,
  problemOf: (field: keyof Values & string) => Problem,
  found: Problems<Values, Problem | "required"> = {},
): Checked<Values, Input, Problem | "required"> {
  if (parsed.success && Object.keys(found).length === 0) return { ok: true, input: parsed.data };
  const problems = { ...found };
  let unplaced = false;
  for (const issue of parsed.error?.issues ?? []) {
    const field = fieldAt(issue.path);
    if (field === undefined) unplaced = true;
    if (field === undefined || problems[field] !== undefined) continue;
    const value = values[field];
    problems[field] = typeof value === "string" && value.trim() === "" ? "required" : problemOf(field);
  }
  return unplaced ? { ok: false, problems, unplaced } : { ok: false, problems };
}
