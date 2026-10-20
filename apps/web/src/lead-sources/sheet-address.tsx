"use client";

// The address a sheet is shared with, read-only beside its Copy button (S3): the connect step's first instruction and
// the lost-access alert's fix. One field for each service account.
import { useTranslations } from "next-intl";
import { CopyButton } from "@/components/copy-button";
import { InputGroup, InputGroupTextarea } from "@/components/ui/input-group";

export function SheetAddress({ emails }: { emails: readonly string[] }) {
  const t = useTranslations("sheets.connect.share");
  return (
    <div className="flex flex-col gap-2">
      {emails.map((email) => (
        <div key={email} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <InputGroup>
            <InputGroupTextarea
              readOnly
              rows={2}
              aria-label={t("addressLabel")}
              value={email}
              className="numbers min-h-0 break-all text-foreground"
            />
          </InputGroup>
          <CopyButton value={email} label={t("copyAddress", { address: email })} />
        </div>
      ))}
    </div>
  );
}
