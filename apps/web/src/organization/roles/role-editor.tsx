"use client";

// One role's name and permissions, saved together. The Owner role is shown read-only: it holds every permission. While
// the subscription refuses changes, the fields, saving and deleting are disabled, and the editor says why (ADR 0021).
import { roleName, type PermissionCatalogEntry, type RoleSummary } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useErrorMessage } from "@/lib/error-message";
import { useWriteAccess } from "@/subscription/write-access";
import { DeleteRoleDialog } from "./delete-role-dialog";
import { toGrantInputs } from "./permission-grants";
import { PermissionsEditor } from "./permissions-editor";
import { useEditableRole } from "./use-editable-role";
import { useUpdateRole } from "./use-roles";

export function RoleEditor({ role, catalog }: { role: RoleSummary; catalog: PermissionCatalogEntry[] }) {
  const t = useTranslations("roles");
  const { apiError } = useErrorMessage();
  const update = useUpdateRole();
  const { name, setName, grants, setGrants, changedUnderYou, loadSaved } = useEditableRole(role);
  const [nameInvalid, setNameInvalid] = useState(false);
  const write = useWriteAccess();

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
        update.mutate({ key: role.key, name: parsed.data, permissions: toGrantInputs(grants) });
      }}
    >
      {changedUnderYou && (
        <Alert>
          <AlertDescription className="flex flex-col items-start gap-2">
            {t("editor.changedUnderYou")}
            <Button type="button" variant="outline" onClick={loadSaved}>
              {t("editor.loadSaved")}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <Field data-invalid={nameInvalid}>
        <FieldLabel htmlFor="role-name">{t("editor.name")}</FieldLabel>
        <Input
          id="role-name"
          value={name}
          maxLength={40}
          aria-invalid={nameInvalid}
          disabled={!write.allowed}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        {nameInvalid && <FieldError>{t("create.nameRequired")}</FieldError>}
      </Field>
      <section className="flex flex-col gap-3">
        <h2 className="text-section font-semibold">{t("editor.permissions")}</h2>
        <FieldDescription>{t("editor.permissionsHint")}</FieldDescription>
        <PermissionsEditor
          catalog={catalog}
          grants={grants}
          onChange={setGrants}
          readOnly={false}
          disabled={!write.allowed}
        />
      </section>
      {update.isError && (
        <Alert variant="destructive">
          <AlertDescription>{apiError(update.error)}</AlertDescription>
        </Alert>
      )}
      {write.hint !== null && <FieldDescription id="role-changes-refused">{write.hint}</FieldDescription>}
      <Separator />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <DeleteRoleDialog role={role} />
        <Button
          type="submit"
          disabled={update.isPending || !write.allowed}
          aria-describedby={write.hint === null ? undefined : "role-changes-refused"}
        >
          {update.isPending ? t("editor.saving") : t("editor.save")}
        </Button>
      </div>
    </form>
  );
}
