"use client";

// One role's name and permissions, saved together. The Owner role is shown read-only: it holds every permission.
import { roleName, type PermissionCatalogEntry, type RoleSummary } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useErrorMessage } from "@/lib/error-message";
import { DeleteRoleDialog } from "./delete-role-dialog";
import { toGrantInputs, type Grant } from "./permission-grants";
import { PermissionsEditor } from "./permissions-editor";
import { useUpdateRole } from "./use-roles";

export function RoleEditor({ role, catalog }: { role: RoleSummary; catalog: PermissionCatalogEntry[] }) {
  const t = useTranslations("roles");
  const { apiError } = useErrorMessage();
  const update = useUpdateRole();
  const [name, setName] = useState(role.name);
  const [grants, setGrants] = useState<Grant[]>(role.permissions);
  const [nameInvalid, setNameInvalid] = useState(false);

  if (role.isOwner) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-muted-foreground">{t("ownerNote")}</p>
        <PermissionsEditor catalog={catalog} grants={[]} onChange={() => undefined} readOnly />
      </div>
    );
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-8"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = roleName.safeParse(name);
        setNameInvalid(!parsed.success);
        if (!parsed.success) return;
        update.mutate(
          { key: role.key, name: parsed.data, permissions: toGrantInputs(grants) },
          { onSuccess: (saved) => toast.success(t("editor.saved", { name: saved.name })) },
        );
      }}
    >
      <Field data-invalid={nameInvalid}>
        <FieldLabel htmlFor="role-name">{t("editor.name")}</FieldLabel>
        <Input
          id="role-name"
          value={name}
          maxLength={40}
          aria-invalid={nameInvalid}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        {nameInvalid && <FieldError>{t("create.nameRequired")}</FieldError>}
      </Field>
      <section className="flex flex-col gap-3">
        <h2 className="text-section font-semibold">{t("editor.permissions")}</h2>
        <FieldDescription>{t("editor.permissionsHint")}</FieldDescription>
        <PermissionsEditor catalog={catalog} grants={grants} onChange={setGrants} readOnly={false} />
      </section>
      {update.isError && (
        <Alert variant="destructive">
          <AlertDescription>{apiError(update.error)}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4 border-t pt-6">
        <DeleteRoleDialog role={role} />
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? t("editor.saving") : t("editor.save")}
        </Button>
      </div>
    </form>
  );
}
