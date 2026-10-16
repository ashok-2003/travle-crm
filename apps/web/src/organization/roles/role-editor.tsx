"use client";

// One role's name and permissions, saved together. The Owner role is shown read-only: it holds every permission. While
// the subscription refuses changes, the fields, saving and deleting are disabled, and the editor says why (ADR 0021),
// which each of them names as its description.
import { roleName, type PermissionCatalogEntry, type RoleSummary } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { DeleteRoleDialog } from "./delete-role-dialog";
import { toGrantInputs } from "./permission-grants";
import { PermissionsEditor } from "./permissions-editor";
import { useEditableRole } from "./use-editable-role";
import { useUpdateRole } from "./use-roles";

export function RoleEditor({ role, catalog }: { role: RoleSummary; catalog: PermissionCatalogEntry[] }) {
  const t = useTranslations("roles");
  const update = useUpdateRole();
  const { name, setName, grants, setGrants, changedUnderYou, loadSaved } = useEditableRole(role);
  const [nameInvalid, setNameInvalid] = useState(false);
  const write = useWriteAccess();
  const refused = write.hint === null ? undefined : "role-changes-refused";
  const inUse = role.memberCount > 0;
  // Why Delete is disabled: the role's members, the subscription, or both.
  const deleteReasons =
    [inUse ? "role-in-use" : undefined, refused].filter((id) => id !== undefined).join(" ") || undefined;
  const tDelete = useTranslations("roles.delete");

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
          aria-describedby={refused}
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
          describedBy={refused}
        />
      </section>
      <RefusalAlert error={update.error} />
      <div className="flex flex-col gap-2">
        {/* On phones the actions stay above the bottom bar while the long list of permissions scrolls (DESIGN.md:
            the mobile sticky action bar); Delete and Save share one row, the reasons under it. */}
        <div className="sticky bottom-[var(--phone-navigation-height,0px)] z-(--z-sticky) -mx-4 bg-background px-4 pb-3 md:static md:mx-0 md:px-0 md:pb-0">
          <Separator className="mb-3" />
          <div className="flex items-center justify-between gap-4">
            <DeleteRoleDialog role={role} describedBy={deleteReasons} />
            <Button type="submit" disabled={update.isPending || !write.allowed} aria-describedby={refused}>
              {update.isPending ? t("editor.saving") : t("editor.save")}
            </Button>
          </div>
        </div>
        {inUse && <FieldDescription id="role-in-use">{tDelete("inUse", { count: role.memberCount })}</FieldDescription>}
        <WriteHint id="role-changes-refused" hint={write.hint} />
      </div>
    </form>
  );
}
