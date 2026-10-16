// A react-hook-form form checked before anything is sent, by a `check` built on checked() (checked.ts): each problem
// shown on its field in the form's own words, a refusal no field explains as `formProblem` (the `forms` message, for
// the form's alert: FormAlert in form-dialog.tsx shows it), and an onSubmit that sends the input the check made, so
// the form checks once. Fields take `form.control` (TextField, SelectField, MoneyField, DateField):
//
//   const { form, onSubmit, formProblem } = useCheckedForm(defaults, (values) => toThingInput(values), (problem) =>
//     t(`problems.${problem}`));
//   <form noValidate onSubmit={onSubmit(save.mutate)}>…<FormAlert sending={save} problem={formProblem} /></form>
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
import type { Checked } from "./checked";

export function useCheckedForm<Values extends FieldValues, Input, Problem extends string>(
  defaultValues: DefaultValues<Values>,
  check: (values: Values) => Checked<Values, Input, Problem>,
  /** A field problem's words: the form's "problems" message for its key. */
  words: (problem: Problem) => string,
): {
  form: UseFormReturn<Values>;
  onSubmit: (send: (input: Input) => void) => SubmitEventHandler<HTMLFormElement>;
  formProblem: string | undefined;
} {
  const t = useTranslations("forms");
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
  // The resolver runs just before a valid submit, so the input it kept is this submit's.
  const onSubmit = (send: (input: Input) => void) => (event: SubmitEvent<HTMLFormElement>) => {
    void form.handleSubmit(() => {
      if (checkedInput.current) send(checkedInput.current.input);
    })(event);
  };
  return { form, onSubmit, formProblem: form.formState.errors.root?.message };
}
