"use client";

// The add-staff form: name, an email or a username (or both), a role and a temporary password, checked by the api's
// own schema before it is sent. Problems show under their fields; a refusal from the api shows above the buttons.
import type { RoleSummary, StaffMember } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { Controller, useForm, type FieldErrors, type Resolver } from "react-hook-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useErrorMessage } from "@/lib/error-message";
import { toCreateStaffInput, type CreateStaffValues } from "./create-staff-values";
import { temporaryPassword } from "./temporary-password";
import { useCreateStaff } from "./use-staff";

/** The roles new staff may be given: every role but Owner, which only an Owner hands over later. */
export function assignableRoles(roles: RoleSummary[]): RoleSummary[] {
  return roles.filter((role) => !role.isOwner);
}

export function CreateStaffForm({
  roles,
  onCreated,
}: {
  roles: RoleSummary[];
  onCreated: (member: StaffMember, password: string) => void;
}) {
  const t = useTranslations("staff");
  const { apiError } = useErrorMessage();
  const create = useCreateStaff();
  const resolver: Resolver<CreateStaffValues> = (values) => {
    const result = toCreateStaffInput(values);
    if (result.ok) return { values, errors: {} };
    const errors: FieldErrors<CreateStaffValues> = {};
    for (const [field, problem] of Object.entries(result.problems)) {
      errors[field as keyof CreateStaffValues] = { type: "validate", message: t(`form.${problem}`) };
    }
    return { values: {}, errors };
  };
  const form = useForm<CreateStaffValues>({
    resolver,
    defaultValues: {
      name: "",
      email: "",
      username: "",
      roleKey: assignableRoles(roles).find((role) => role.key === "sales")?.key ?? "",
      temporaryPassword: temporaryPassword(),
    },
  });
  const { errors } = form.formState;

  const submit = form.handleSubmit((values) => {
    const result = toCreateStaffInput(values);
    if (!result.ok) return;
    create.mutate(result.input, {
      onSuccess: (member) => {
        onCreated(member, values.temporaryPassword);
      },
    });
  });

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
      <FieldGroup>
        <Field data-invalid={errors.name !== undefined}>
          <FieldLabel htmlFor="staff-name">{t("create.name")}</FieldLabel>
          <Input
            id="staff-name"
            autoComplete="off"
            aria-invalid={errors.name !== undefined}
            {...form.register("name")}
          />
          <FieldError errors={[errors.name]} />
        </Field>
        <Field data-invalid={errors.email !== undefined}>
          <FieldLabel htmlFor="staff-email">{t("create.email")}</FieldLabel>
          <Input
            id="staff-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            aria-invalid={errors.email !== undefined}
            {...form.register("email")}
          />
          <FieldDescription>{t("create.emailHint")}</FieldDescription>
          <FieldError errors={[errors.email]} />
        </Field>
        <Field data-invalid={errors.username !== undefined}>
          <FieldLabel htmlFor="staff-username">{t("create.username")}</FieldLabel>
          <Input
            id="staff-username"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={errors.username !== undefined}
            {...form.register("username")}
          />
          <FieldDescription>{t("create.usernameHint")}</FieldDescription>
          <FieldError errors={[errors.username]} />
        </Field>
        <Field data-invalid={errors.roleKey !== undefined}>
          <FieldLabel htmlFor="staff-role">{t("create.role")}</FieldLabel>
          <Controller
            control={form.control}
            name="roleKey"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="staff-role" className="h-11 w-full" aria-invalid={errors.roleKey !== undefined}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assignableRoles(roles).map((role) => (
                    <SelectItem key={role.key} value={role.key}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError errors={[errors.roleKey]} />
        </Field>
        <Field data-invalid={errors.temporaryPassword !== undefined}>
          <FieldLabel htmlFor="staff-password">{t("create.temporaryPassword")}</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="staff-password"
              className="numbers"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={errors.temporaryPassword !== undefined}
              {...form.register("temporaryPassword")}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                form.setValue("temporaryPassword", temporaryPassword());
              }}
            >
              {t("create.newPassword")}
            </Button>
          </div>
          <FieldDescription>{t("create.temporaryPasswordHint")}</FieldDescription>
          <FieldError errors={[errors.temporaryPassword]} />
        </Field>
      </FieldGroup>
      {create.isError && (
        <Alert variant="destructive">
          <AlertDescription>{apiError(create.error)}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={create.isPending} className="self-end">
        {create.isPending ? t("create.submitting") : t("create.submit")}
      </Button>
    </form>
  );
}
