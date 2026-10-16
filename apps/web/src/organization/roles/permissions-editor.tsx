"use client";

// The permissions of a role, grouped by module: a checkbox each, and for view permissions whose records they cover.
// Read-only for the Owner role, which holds everything; disabled, as they stand, while the subscription refuses changes.
import type { PermissionCatalogEntry } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { byModule, setScope, toggle, type Grant } from "./permission-grants";
import { usePermissionLabels } from "./permission-labels";

export function PermissionsEditor({
  catalog,
  grants,
  onChange,
  readOnly,
  disabled = false,
  describedBy,
}: {
  catalog: PermissionCatalogEntry[];
  grants: Grant[];
  onChange: (grants: Grant[]) => void;
  readOnly: boolean;
  disabled?: boolean;
  /** The id of what says why the fields are disabled. */
  describedBy?: string | undefined;
}) {
  const t = useTranslations("roles.editor");
  const labels = usePermissionLabels();
  const grantOf = (permission: string) => grants.find((grant) => grant.permission === permission);
  return (
    <div className="flex flex-col gap-6">
      {byModule(catalog).map(({ module, entries }) => (
        <FieldSet key={module} className="gap-3">
          <FieldLegend variant="label">{labels.moduleName(module)}</FieldLegend>
          {entries.map((entry) => {
            const grant = grantOf(entry.permission);
            const id = `permission-${entry.permission.replace(":", "-")}`;
            return (
              <div key={entry.permission} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Field orientation="horizontal" className="min-h-11 w-auto flex-1">
                  <Checkbox
                    id={id}
                    checked={readOnly || grant !== undefined}
                    disabled={readOnly || disabled}
                    aria-describedby={describedBy}
                    onCheckedChange={(checked) => {
                      onChange(toggle(grants, entry, checked === true));
                    }}
                  />
                  <FieldLabel htmlFor={id} className="font-normal">
                    {labels.permission(entry.permission)}
                  </FieldLabel>
                </Field>
                {entry.scoped && grant !== undefined && !readOnly && (
                  <Select
                    disabled={disabled}
                    value={grant.scope ?? "own"}
                    onValueChange={(scope) => {
                      onChange(setScope(grants, entry.permission, scope === "all" ? "all" : "own"));
                    }}
                  >
                    <SelectTrigger
                      className="h-11 w-44"
                      aria-label={`${t("scope")}: ${labels.permission(entry.permission)}`}
                      aria-describedby={describedBy}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="own">{t("scopeOwn")}</SelectItem>
                      <SelectItem value="all">{t("scopeAll")}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            );
          })}
        </FieldSet>
      ))}
    </div>
  );
}
