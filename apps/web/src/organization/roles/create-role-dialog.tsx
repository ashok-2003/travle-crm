"use client";

// "New role": a name first, with no permissions; the editor it opens is where permissions are chosen.
import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { roleName } from "@travel-crm/contracts/identity";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useErrorMessage } from "@/lib/error-message";
import { routes } from "@/lib/routes";
import { ResponsiveDialog } from "../responsive-dialog";
import { useCreateRole } from "./use-roles";

export function CreateRoleDialog() {
  const t = useTranslations("roles.create");
  const tRoles = useTranslations("roles");
  const { apiError } = useErrorMessage();
  const router = useRouter();
  const create = useCreateRole();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [invalid, setInvalid] = useState(false);

  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        <PlusIcon aria-hidden="true" />
        {tRoles("add")}
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title={t("title")} description={t("description")}>
        <form
          noValidate
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = roleName.safeParse(name);
            setInvalid(!parsed.success);
            if (!parsed.success) return;
            create.mutate(
              { name: parsed.data, permissions: [] },
              {
                onSuccess: (role) => {
                  router.push(`${routes.roles}/${role.key}`);
                },
              },
            );
          }}
        >
          <Field data-invalid={invalid}>
            <FieldLabel htmlFor="role-name">{t("name")}</FieldLabel>
            <Input
              id="role-name"
              value={name}
              maxLength={40}
              aria-invalid={invalid}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
            <FieldDescription>{t("nameHint")}</FieldDescription>
            {invalid && <FieldError>{t("nameRequired")}</FieldError>}
          </Field>
          {create.isError && (
            <Alert variant="destructive">
              <AlertDescription>{apiError(create.error)}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={create.isPending} className="self-end">
            {create.isPending ? t("submitting") : t("submit")}
          </Button>
        </form>
      </ResponsiveDialog>
    </>
  );
}
