"use client";

// A package's brochures (group packages): files that go straight to storage and that the AI shares with a customer on
// request. Up to five (PDF or a picture). The payment QR, where customers pay, is in the payments card.
import { MAX_PACKAGE_BROCHURES, type PackageFile } from "@travel-crm/contracts/quotes";
import { CircleAlertIcon, FilePlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { SectionCard } from "@/bookings/section-card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { RefusalAlert } from "@/components/refusal-alert";
import { TextLink } from "@/components/text-link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { formatFileSize } from "@/files/file-size";
import { brochureLimit, brochureProblem } from "./package-file-check";
import { usePackageFileChanges, usePackageFiles } from "./use-package-files";

const BROCHURE_TYPES = "application/pdf,image/jpeg,image/png,image/webp";

export function PackageFilesCard({ packageId }: { packageId: string }) {
  const t = useTranslations("packages.files");
  const files = usePackageFiles(packageId);
  const { add, remove } = usePackageFileChanges(packageId);
  const access = useWriteAccess("change");
  const hintId = `${useId()}-write`;
  const [removing, setRemoving] = useState<PackageFile | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const brochurePicker = useRef<HTMLInputElement>(null);
  const brochures = files.data?.brochures ?? [];
  const [problem, setProblem] = useState<string | null>(null);
  const picked = (event: { target: HTMLInputElement }) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) return;
    const wrong = brochureProblem(file);
    setProblem(wrong === null ? null : t(`problems.${wrong}`, { size: formatFileSize(brochureLimit) }));
    if (wrong === null) add.mutate(file);
  };
  const row = (file: PackageFile) => (
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
        onClick={(event) => {
          opener.current = event.currentTarget;
          setRemoving(file);
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
      ) : brochures.length === 0 ? (
        <p className="text-muted-foreground">{t("noBrochures")}</p>
      ) : (
        <ul>{brochures.map(row)}</ul>
      )}
      {problem !== null && (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      )}
      <RefusalAlert error={add.error} />
      <input
        ref={brochurePicker}
        type="file"
        accept={BROCHURE_TYPES}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="package-brochure-input"
        onChange={picked}
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
      </div>
      <WriteHint id={hintId} hint={access.hint} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(next) => {
          if (!next) setRemoving(null);
        }}
        title={t("removeTitle", { name: removing?.fileName ?? "" })}
        description={t("removeDescription")}
        action={t("remove")}
        request={remove}
        returnFocusTo={opener}
        onConfirm={() => {
          if (removing === null) return;
          remove.mutate(
            { packageId, kind: "brochure", attachmentId: removing.attachmentId },
            {
              onSuccess: () => {
                setRemoving(null);
              },
            },
          );
        }}
      />
    </SectionCard>
  );
}
