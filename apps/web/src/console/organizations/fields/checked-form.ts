// How the console's organization forms are checked before anything is sent: by the api's own schema, each of its
// refusals put on the form field it came from as that field's problem (a message key), and one no field explains on
// the form as a whole; and a form whose submit sends the input its resolver checked, so each form runs its check once.
import { useTranslations } from "next-intl";
import { useRef, type SubmitEvent, type SubmitEventHandler } from "react";
import {
  useForm,
  type DefaultValues,
  type FieldErrors,
  type FieldValues,
  type Resolver,
  type UseFormReturn,
} from "react-hook-form";
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

/**
 * A form checked by `check` before it is sent, each problem's `words` on its field and an unplaced one as
 * `formProblem` (for the form's alert); and its onSubmit, which sends the input that check made: the resolver runs
 * just before a valid submit, so the form checks once.
 */
export function useCheckedForm<Values extends FieldValues, Input, Problem extends string>(
  defaultValues: DefaultValues<Values>,
  check: (values: Values) => Checked<Values, Input, Problem>,
  words: (problem: Problem) => string,
): {
  form: UseFormReturn<Values>;
  onSubmit: (send: (input: Input) => void) => SubmitEventHandler<HTMLFormElement>;
  formProblem: string | undefined;
} {
  const t = useTranslations("consoleOrganizations");
  const checkedInput = useRef<{ input: Input } | null>(null);
  const resolver: Resolver<Values> = (values) => {
    const result = check(values);
    checkedInput.current = result.ok ? { input: result.input } : null;
    if (result.ok) return { values, errors: {} };
    const errors: Record<string, { type: string; message: string }> = {};
    for (const [field, problem] of Object.entries<Problem | undefined>(result.problems)) {
      if (problem !== undefined) errors[field] = { type: "validate", message: words(problem) };
    }
    // With a resolver, react-hook-form keeps a root error and treats the form as refused.
    if (result.unplaced) errors.root = { type: "validate", message: t("formProblem") };
    return { values: {}, errors: errors as FieldErrors<Values> };
  };
  const form = useForm<Values>({ resolver, defaultValues });
  const onSubmit = (send: (input: Input) => void) => (event: SubmitEvent<HTMLFormElement>) => {
    void form.handleSubmit(() => {
      if (checkedInput.current) send(checkedInput.current.input);
    })(event);
  };
  return { form, onSubmit, formProblem: form.formState.errors.root?.message };
}
