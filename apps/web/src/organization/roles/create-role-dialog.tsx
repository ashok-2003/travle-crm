"use client";

// "New role": a name first, with no permissions; the editor it opens is where permissions are chosen. A new role is
// a change, so while the subscription refuses changes the button is disabled and says why (ADR 0021).
import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { roleName } from "@travel-crm/contracts/identity";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { useCreateRole } from "./use-roles";
import { FormField } from "@/components/form-field";

export function CreateRoleDialog() {
  const t = useTranslations("roles.create");
  const tRoles = useTranslations("roles");
  const create = useCreateRole();
  const write = useWriteAccess();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [invalid, setInvalid] = useState(false);
  const formId = useId();

  const changeOpen = (next: boolean) => {
    setOpen(next);
    // Closed, it starts over: no half-typed name, no old refusal.
    if (!next) {
      setName("");
      setInvalid(false);
      create.reset();
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        disabled={!write.allowed}
        aria-describedby={write.hint === null ? undefined : "new-role-refused"}
        onClick={() => {
          setOpen(true);
        }}
      >
        <PlusIcon aria-hidden="true" />
        {tRoles("add")}
      </Button>
      <WriteHint id="new-role-refused" hint={write.hint} />
      <ResponsiveDialog
        open={open}
        onOpenChange={changeOpen}
        busy={create.isPending}
        title={t("title")}
        description={t("description")}
        footer={
          <Button type="submit" form={formId} disabled={create.isPending}>
            {create.isPending ? t("submitting") : t("submit")}
          </Button>
        }
      >
        <form
          id={formId}
          noValidate
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = roleName.safeParse(name);
            setInvalid(!parsed.success);
            if (!parsed.success) return;
            create.mutate({ name: parsed.data, permissions: [] });
          }}
        >
          <FormField label={t("name")} hint={t("nameHint")} error={invalid ? t("nameRequired") : undefined}>
            {(links) => (
              <Input
                {...links}
                value={name}
                maxLength={40}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            )}
          </FormField>
          <RefusalAlert error={create.error} />
        </form>
      </ResponsiveDialog>
    </div>
  );
}
