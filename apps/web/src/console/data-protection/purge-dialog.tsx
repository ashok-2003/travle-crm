"use client";

// The last step of a deletion for good: the organization's code typed to confirm, then the request (the section's, and
// its handling of the answer survives this dialog closing), which the console's job carries out once it has checked
// everything again. A refusal shows its sentence; a missing export gets the deletion's own (the api's EXPORT_FIRST is
// worded for an erasure).
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { ReturnFocusTo } from "@/components/return-focus";
import { refusalOf } from "@/data/api-error";
import { useErrorMessage } from "@/lib/error-message";
import { TypedConfirmation } from "./typed-confirmation";

export function PurgeDialog({
  organization,
  open,
  onOpenChange,
  returnFocusTo,
  request,
  onConfirm,
}: {
  organization: { name: string; code: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The button that opened it, which takes the focus back when it closes. */
  returnFocusTo: ReturnFocusTo;
  /** The deletion's request, owned by the section. */
  request: Parameters<typeof ConfirmDialog>[0]["request"];
  onConfirm: (confirmation: string) => void;
}) {
  const t = useTranslations("consolePlatform.dataProtection.purge");
  const { apiError } = useErrorMessage();
  const [typed, setTyped] = useState("");
  return (
    <ConfirmDialog
      returnFocusTo={returnFocusTo}
      open={open}
      onOpenChange={onOpenChange}
      title={t("confirmTitle", { name: organization.name })}
      description={t("confirmDescription")}
      action={t("confirm")}
      request={request}
      onConfirm={() => {
        onConfirm(typed);
      }}
      confirmDisabled={typed !== organization.code}
      refusal={(error) => (refusalOf(error)?.reason === "EXPORT_FIRST" ? t("notExported") : apiError(error))}
    >
      <TypedConfirmation code={organization.code} value={typed} onChange={setTyped} />
    </ConfirmDialog>
  );
}
