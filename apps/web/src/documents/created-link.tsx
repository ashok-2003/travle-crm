"use client";

// A new link's whole address, shown this once (only a hash of its secret is kept), with a way to copy it. The dialog's
// footer holds Done.
import { useTranslations } from "next-intl";
import { CopyButton } from "@/components/copy-button";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";

export function CreatedLink({ path }: { path: string }) {
  const t = useTranslations("documents.share");
  // On the app's own address: it hands /p to the api, so the customer never sees another one.
  const address = new URL(path, window.location.origin).href;
  return (
    <FormField label={t("linkLabel")} hint={t("onlyOnce")}>
      {(links) => (
        <div className="flex gap-2">
          <Input
            {...links}
            readOnly
            value={address}
            className="numbers"
            onFocus={(event) => {
              event.currentTarget.select();
            }}
          />
          <CopyButton value={address} label={t("copyLink")} />
        </div>
      )}
    </FormField>
  );
}
