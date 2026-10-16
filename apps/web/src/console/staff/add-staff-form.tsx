"use client";

// The add form: the newcomer's full name, their address (they sign in with it) and their level, checked by the api's
// own schema before it is sent. Problems show under their fields; a refusal from the api shows above the button, which
// is the dialog's (AddStaffDialog), sending this form by its id.
import type { AddPlatformStaffInput } from "@travel-crm/contracts/platform";
import { Controller } from "react-hook-form";
import { useTranslations } from "next-intl";
import { TextField } from "@/account/text-field";
import { FormAlert } from "@/components/forms/form-dialog";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { FieldGroup } from "@/components/ui/field";
import { toAddStaffInput } from "./add-staff-values";
import { LevelField } from "./level-field";

export function AddStaffForm({
  id,
  send,
  sending,
}: {
  id: string;
  send: (input: AddPlatformStaffInput) => void;
  /** The add, whose refusal is shown above the dialog's button. */
  sending: { error: unknown };
}) {
  const t = useTranslations("consolePlatform.staff.addForm");
  const { form, onSubmit, formProblem } = useCheckedForm(
    { name: "", email: "", level: "support" as const },
    toAddStaffInput,
    (problem) => t(`problems.${problem}`),
  );
  return (
    <form id={id} noValidate onSubmit={onSubmit(send)} className="flex flex-col gap-6">
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
      <FormAlert sending={sending} problem={formProblem} />
    </form>
  );
}
