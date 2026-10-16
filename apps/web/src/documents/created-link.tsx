"use client";

// A new link's whole address, shown this once (only a hash of its secret is kept), with a way to copy it.
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/organization/copy-button";

export function CreatedLink({ path, onDone }: { path: string; onDone: () => void }) {
  const t = useTranslations("documents.share");
  // On the app's own address: it hands /p to the api, so the customer never sees another one.
  const address = new URL(path, window.location.origin).href;
  return (
    <div className="flex flex-col gap-6">
      <Field>
        <FieldLabel htmlFor="created-share-link">{t("linkLabel")}</FieldLabel>
        <div className="flex gap-2">
          <Input
            id="created-share-link"
            readOnly
            value={address}
            className="numbers"
            onFocus={(event) => {
              event.currentTarget.select();
            }}
          />
          <CopyButton value={address} label={t("copyLink")} />
        </div>
        <FieldDescription>{t("onlyOnce")}</FieldDescription>
      </Field>
      <Button className="self-end" onClick={onDone}>
        {t("done")}
      </Button>
    </div>
  );
}
