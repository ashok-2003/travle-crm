"use client";

// The last step of an erasure: the organization's code typed to confirm, then the request (the section's, and its
// handling of the answer survives this dialog closing), which the console's job carries out once it has checked again.
// A refusal shows its sentence (remove them first, export them first, a record the law keeps or that holds no one's
// data).
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { TypedConfirmation } from "./typed-confirmation";

export function ErasureDialog({
  code,
  open,
  onOpenChange,
  request,
  onConfirm,
}: {
  /** The organization's code, which is typed to confirm. */
  code: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The erasure's request, owned by the section. */
  request: Parameters<typeof ConfirmDialog>[0]["request"];
  onConfirm: (confirmation: string) => void;
}) {
  const t = useTranslations("consolePlatform.dataProtection.subject");
  const [typed, setTyped] = useState("");
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("eraseTitle")}
      description={t("eraseDescription")}
      action={t("confirmErase")}
      request={request}
      onConfirm={() => {
        onConfirm(typed);
      }}
      confirmDisabled={typed !== code}
    >
      <TypedConfirmation code={code} value={typed} onChange={setTyped} />
    </ConfirmDialog>
  );
}
