"use client";

// Changing a person's phone from their row's menu (B51): the number typed the Indian way, or emptied to remove it.
// Checked by the api's own schema before it is sent. A FormDialog: it holds while the request is out, and the list
// refreshes even once it closes.
import { changeStaffPhoneInput, type ChangeStaffPhoneInput, type StaffMember } from "@travel-crm/contracts/identity";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { checked } from "@/components/forms/checked";
import { FormAlert, FormDialog, useFormDialog, type Sending } from "@/components/forms/form-dialog";
import { PhoneField, phoneAsTyped } from "@/components/forms/phone-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { FieldGroup } from "@/components/ui/field";
import type { ReturnFocusTo } from "@/components/return-focus";
import { useTRPC } from "@/data/trpc";
import { useRefreshStaff } from "./use-staff";

interface PhoneValues {
  phone: string;
}

type Problem = "invalid" | "required";

/** The box as the api's input: emptied, no phone at all. */
export function toChangePhoneInput(memberId: string, values: PhoneValues) {
  const typed = values.phone.trim();
  return checked(
    changeStaffPhoneInput.safeParse({ memberId, phone: typed === "" ? null : typed }),
    values,
    (path) => (path[0] === "phone" ? "phone" : undefined),
    (): Problem => "invalid",
  );
}

function ChangePhoneForm({
  formId,
  member,
  change,
}: {
  formId: string;
  member: StaffMember;
  change: Sending<ChangeStaffPhoneInput>;
}) {
  const t = useTranslations("staff.changePhone");
  const { form, onSubmit, formProblem } = useCheckedForm<PhoneValues, ChangeStaffPhoneInput, Problem>(
    { phone: phoneAsTyped(member.phone) },
    (values) => toChangePhoneInput(member.memberId, values),
    (problem) => t(`problems.${problem}`),
  );
  return (
    <form id={formId} noValidate onSubmit={onSubmit(change.mutate)} className="flex flex-col gap-4">
      <FieldGroup>
        <PhoneField control={form.control} name="phone" label={t("label")} />
      </FieldGroup>
      <FormAlert sending={change} problem={formProblem} />
    </form>
  );
}

export function ChangePhoneDialog({
  member,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  member: StaffMember;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The button that opened it, which takes the focus back when it closes. */
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("staff.changePhone");
  const trpc = useTRPC();
  const dialog = useFormDialog(t("changed", { name: member.name }), useRefreshStaff(), { open, setOpen: onOpenChange });
  const change = useMutation(trpc.staff.changePhone.mutationOptions({ onSuccess: dialog.onSuccess }));
  return (
    <FormDialog
      returnFocusTo={returnFocusTo}
      dialog={dialog}
      sending={change}
      title={t("title", { name: member.name })}
      description={t("description")}
      submit={t("submit")}
      submitting={t("submitting")}
    >
      {(formId) => <ChangePhoneForm formId={formId} member={member} change={change} />}
    </FormDialog>
  );
}
