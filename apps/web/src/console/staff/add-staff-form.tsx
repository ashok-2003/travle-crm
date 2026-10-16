"use client";

// The add form: the newcomer's full name, their address (they sign in with it) and their level, checked by the api's
// own schema before it is sent. Problems show under their fields; a refusal from the api shows above the button.
import { useTranslations } from "next-intl";
import { Controller, useForm, type FieldErrors, type Resolver } from "react-hook-form";
import { TextField } from "@/account/text-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { useErrorMessage } from "@/lib/error-message";
import { toAddStaffInput, type AddStaffValues } from "./add-staff-values";
import { LevelField } from "./level-field";
import type { useAddPlatformStaff } from "./use-platform-staff";

export function AddStaffForm({
  add,
}: {
  /** The add call, owned by the dialog so that it can clear it (and the password in its answer) when it closes. */
  add: ReturnType<typeof useAddPlatformStaff>;
}) {
  const t = useTranslations("consolePlatform.staff.addForm");
  const { apiError } = useErrorMessage();
  const resolver: Resolver<AddStaffValues> = (values) => {
    const result = toAddStaffInput(values);
    if (result.ok) return { values, errors: {} };
    const errors: FieldErrors<AddStaffValues> = {};
    for (const [field, problem] of Object.entries(result.problems)) {
      errors[field as keyof AddStaffValues] = { type: "validate", message: t(`problems.${problem}`) };
    }
    return { values: {}, errors };
  };
  const form = useForm<AddStaffValues>({ resolver, defaultValues: { name: "", email: "", level: "support" } });
  const submit = form.handleSubmit((values) => {
    const result = toAddStaffInput(values);
    if (!result.ok) return;
    add.mutate(result.input);
  });
  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
      <FieldGroup>
        <TextField control={form.control} name="name" label={t("name")} autoComplete="off" />
        <TextField
          control={form.control}
          name="email"
          label={t("email")}
          type="email"
          inputMode="email"
          autoComplete="off"
        />
        <Controller
          control={form.control}
          name="level"
          render={({ field }) => <LevelField value={field.value} onChange={field.onChange} />}
        />
      </FieldGroup>
      {add.isError && (
        <Alert variant="destructive">
          <AlertDescription>{apiError(add.error)}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={add.isPending} className="self-end">
        {add.isPending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
