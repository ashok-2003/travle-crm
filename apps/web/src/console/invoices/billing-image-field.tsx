"use client";

// The firm's logo or signature on the billing details form: choose a PNG or JPEG of at most 1 MB, which goes straight
// to storage by a link the api signed; the key it is stored under is the field's value, saved with the other details.
// It shows what will print (the saved image by a short-lived link, a new one from the chosen file itself), and can be
// replaced or removed. Nothing is kept until the details are saved.
import { MAX_BILLING_IMAGE_BYTES, type BillingImageKind } from "@travel-crm/contracts/platform";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Controller, type Control } from "react-hook-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { RefusalAlert } from "@/components/refusal-alert";
import { useConsoleTRPC } from "../data/console-trpc";
import type { BillingDetailsValues } from "./billing-details-values";
import { useUploadBillingImage } from "./use-invoices";

const TYPES = ["image/png", "image/jpeg"] as const;
type ImageType = (typeof TYPES)[number];
const isImageType = (type: string): type is ImageType => (TYPES as readonly string[]).includes(type);

/** What is on show: the saved image from storage, or the file just chosen. */
function useShownImage(kind: BillingImageKind, shownSaved: boolean, chosenUrl: string | null): string | null {
  const trpc = useConsoleTRPC();
  const saved = useQuery({
    ...trpc.invoices.billingImageLink.queryOptions({ kind }),
    enabled: shownSaved && chosenUrl === null,
  });
  return chosenUrl ?? (shownSaved ? (saved.data?.url ?? null) : null);
}

function BillingImage({
  kind,
  value,
  savedKey,
  onChange,
}: {
  kind: BillingImageKind;
  value: string;
  /** The key saved on the details now: only that one can be shown from storage. */
  savedKey: string;
  onChange: (key: string) => void;
}) {
  const t = useTranslations("consoleInvoices.billingDetails");
  const name = t(`names.${kind}`);
  const picker = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<{ key: string; url: string } | null>(null);
  const [problem, setProblem] = useState<"type" | "size" | null>(null);
  const upload = useUploadBillingImage(kind);
  const shown = useShownImage(kind, value !== "" && value === savedKey, chosen?.key === value ? chosen.url : null);
  // A file's preview is a blob in this tab: let it go when another replaces it, and when the form closes.
  useEffect(
    () => () => {
      if (chosen !== null) URL.revokeObjectURL(chosen.url);
    },
    [chosen],
  );

  const choose = (file: File) => {
    setProblem(null);
    if (!isImageType(file.type)) {
      setProblem("type");
      return;
    }
    if (file.size === 0 || file.size > MAX_BILLING_IMAGE_BYTES) {
      setProblem("size");
      return;
    }
    upload.mutate(
      { file, contentType: file.type },
      {
        onSuccess: (key) => {
          setChosen({ key, url: URL.createObjectURL(file) });
          onChange(key);
        },
      },
    );
  };

  return (
    <Field>
      <FieldLabel>{t(kind)}</FieldLabel>
      {shown !== null && (
        <>
          {/* A blob of the chosen file, or a link to storage, which Next's image optimiser can't fetch. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shown} alt={t("imageAlt", { name })} className="max-h-16 max-w-48 self-start object-contain" />
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={upload.isPending} onClick={() => picker.current?.click()}>
          {upload.isPending && <Spinner />}
          {upload.isPending ? t("uploading") : value === "" ? t("choose", { name }) : t("replace", { name })}
        </Button>
        {value !== "" && (
          <Button
            type="button"
            variant="ghost"
            disabled={upload.isPending}
            onClick={() => {
              setChosen(null);
              onChange("");
            }}
          >
            {t("remove", { name })}
          </Button>
        )}
      </div>
      <input
        ref={picker}
        type="file"
        accept={TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-label={t("choose", { name })}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared, so choosing the same file again is a change.
          event.target.value = "";
          if (file) choose(file);
        }}
      />
      {chosen?.key === value && value !== savedKey && <FieldDescription>{t("uploaded")}</FieldDescription>}
      {problem !== null && (
        <Alert variant="destructive">
          <AlertDescription>{t(`imageProblems.${problem}`)}</AlertDescription>
        </Alert>
      )}
      <RefusalAlert error={upload.error} />
    </Field>
  );
}

export function BillingImageField({
  control,
  name,
  kind,
  savedKey,
}: {
  control: Control<BillingDetailsValues>;
  name: "logoKey" | "signatureKey";
  kind: BillingImageKind;
  savedKey: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <BillingImage kind={kind} value={field.value} savedKey={savedKey} onChange={field.onChange} />
      )}
    />
  );
}
