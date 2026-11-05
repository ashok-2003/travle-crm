"use client";

// A package's brochures and payment QR (group packages): files that go straight to storage and that the AI shares with a
// customer on request. Up to five brochures (PDF or a picture) and one QR (a picture).
import { MAX_PACKAGE_BROCHURES, type PackageFile, type PackageFileKind } from "@travel-crm/contracts/quotes";
import { FilePlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef } from "react";
import { SectionCard } from "@/bookings/section-card";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { RefusalAlert } from "@/components/refusal-alert";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { usePackageFileChanges, usePackageFiles } from "./use-package-files";

const BROCHURE_TYPES = "application/pdf,image/jpeg,image/png,image/webp";
const QR_TYPES = "image/jpeg,image/png,image/webp";

export function PackageFilesCard({ packageId }: { packageId: string }) {
  const t = useTranslations("packages.files");
  const files = usePackageFiles(packageId);
  const { add, remove } = usePackageFileChanges(packageId);
  const access = useWriteAccess("change");
  const hintId = `${useId()}-write`;
  const brochurePicker = useRef<HTMLInputElement>(null);
  const qrPicker = useRef<HTMLInputElement>(null);
  const brochures = files.data?.brochures ?? [];
  const qr = files.data?.paymentQr ?? null;
  const picked = (kind: PackageFileKind) => (event: { target: HTMLInputElement }) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file !== undefined) add.mutate({ kind, file });
  };
  const row = (kind: PackageFileKind, file: PackageFile) => (
    <li key={file.attachmentId} className="flex items-center justify-between gap-2">
      {file.url === null ? (
        <span>{file.fileName}</span>
      ) : (
        <TextLink inline newTab href={file.url}>
          {file.fileName}
        </TextLink>
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("removeNamed", { name: file.fileName })}
        disabled={remove.isPending || !access.allowed}
        aria-describedby={access.allowed ? undefined : hintId}
        onClick={() => {
          remove.mutate({ packageId, kind, attachmentId: file.attachmentId });
        }}
      >
        <Trash2Icon aria-hidden="true" />
      </Button>
    </li>
  );
  return (
    <SectionCard title={t("title")}>
      <p className="text-muted-foreground">{t("intro", { max: MAX_PACKAGE_BROCHURES })}</p>
      {files.data === undefined ? (
        files.isError ? (
          <LoadFailedAlert message={t("loadFailed")} error={files.error} onRetry={() => void files.refetch()} />
        ) : (
          <LoadingRows shape="twoLines" label={t("loading")} />
        )
      ) : (
        <>
          <h3 className="font-medium">{t("brochures")}</h3>
          {brochures.length === 0 ? (
            <p className="text-muted-foreground">{t("noBrochures")}</p>
          ) : (
            <ul>{brochures.map((file) => row("brochure", file))}</ul>
          )}
          <h3 className="font-medium">{t("qr")}</h3>
          {qr === null ? <p className="text-muted-foreground">{t("noQr")}</p> : <ul>{row("payment_qr", qr)}</ul>}
        </>
      )}
      <RefusalAlert error={add.error ?? remove.error} />
      <input
        ref={brochurePicker}
        type="file"
        accept={BROCHURE_TYPES}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="package-brochure-input"
        onChange={picked("brochure")}
      />
      <input
        ref={qrPicker}
        type="file"
        accept={QR_TYPES}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="package-qr-input"
        onChange={picked("payment_qr")}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={add.isPending || brochures.length >= MAX_PACKAGE_BROCHURES || !access.allowed}
          aria-describedby={access.allowed ? undefined : hintId}
          onClick={() => brochurePicker.current?.click()}
        >
          {add.isPending ? <Spinner aria-hidden="true" /> : <FilePlusIcon aria-hidden="true" />}
          {add.isPending ? t("adding") : t("addBrochure")}
        </Button>
        <Button
          variant="outline"
          disabled={add.isPending || !access.allowed}
          aria-describedby={access.allowed ? undefined : hintId}
          onClick={() => qrPicker.current?.click()}
        >
          {qr === null ? t("addQr") : t("replaceQr")}
        </Button>
      </div>
      <WriteHint id={hintId} hint={access.hint} />
    </SectionCard>
  );
}
