"use client";

// Where customers pay (group packages): the bank or UPI details a customer is told, and the payment QR. Money, so only
// whoever manages settings changes it (the api checks); others read it here, disabled, with a line that says why.
import type { PackageDetail } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/bookings/section-card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { RefusalAlert } from "@/components/refusal-alert";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { usePaymentQrChanges, usePackageFiles } from "./use-package-files";
import { usePackageChanges } from "./use-packages";

const QR_TYPES = "image/jpeg,image/png,image/webp";

export function PaymentsCard({ detail }: { detail: PackageDetail }) {
  const t = useTranslations("packages.payments");
  const id = useId();
  const hintId = `${id}-write`;
  const mayManage = useHolds("settings:manage");
  const access = useWriteAccess("change");
  const allowed = access.allowed && mayManage;
  const { setPaymentDetails } = usePackageChanges();
  const files = usePackageFiles(detail.id);
  const { add, remove } = usePaymentQrChanges(detail.id);
  const [typed, setTyped] = useState(detail.paymentDetails);
  const [removing, setRemoving] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const qr = files.data?.paymentQr ?? null;
  return (
    <SectionCard title={t("title")}>
      <Field>
        <FieldLabel htmlFor={`${id}-details`}>{t("details")}</FieldLabel>
        <Textarea
          id={`${id}-details`}
          rows={4}
          maxLength={1000}
          value={typed}
          disabled={!allowed || setPaymentDetails.isPending}
          onChange={(event) => {
            setTyped(event.target.value);
          }}
        />
        <FieldDescription>{t("detailsHint")}</FieldDescription>
      </Field>
      <div>
        <Button
          variant="outline"
          disabled={!allowed || setPaymentDetails.isPending || typed.trim() === detail.paymentDetails}
          aria-describedby={access.allowed ? undefined : hintId}
          onClick={() => {
            setPaymentDetails.mutate(
              { packageId: detail.id, paymentDetails: typed.trim() },
              { onSuccess: () => toast.success(t("saved")) },
            );
          }}
        >
          {setPaymentDetails.isPending ? t("saving") : t("save")}
        </Button>
      </div>
      <RefusalAlert error={setPaymentDetails.error} />
      <h3 className="font-medium">{t("qr")}</h3>
      {files.data === undefined ? (
        files.isError && (
          <LoadFailedAlert message={t("loadFailed")} error={files.error} onRetry={() => void files.refetch()} />
        )
      ) : qr === null ? (
        <p className="text-muted-foreground">{t("noQr")}</p>
      ) : (
        <div className="flex items-center justify-between gap-2">
          {qr.url === null ? (
            <span>{qr.fileName}</span>
          ) : (
            <TextLink inline newTab href={qr.url}>
              {qr.fileName}
            </TextLink>
          )}
          <Button
            variant="ghost"
            disabled={!allowed || remove.isPending}
            aria-label={t("removeNamed", { name: qr.fileName })}
            aria-describedby={access.allowed ? undefined : hintId}
            onClick={(event) => {
              opener.current = event.currentTarget;
              setRemoving(true);
            }}
          >
            {t("remove")}
          </Button>
        </div>
      )}
      <RefusalAlert error={add.error} />
      <input
        ref={picker}
        type="file"
        accept={QR_TYPES}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="package-qr-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file !== undefined) add.mutate(file);
        }}
      />
      <div>
        <Button
          variant="outline"
          disabled={!allowed || add.isPending}
          aria-describedby={access.allowed ? undefined : hintId}
          onClick={() => picker.current?.click()}
        >
          {add.isPending && <Spinner aria-hidden="true" />}
          {add.isPending ? t("adding") : qr === null ? t("addQr") : t("replaceQr")}
        </Button>
        <WriteHint id={hintId} hint={access.hint} />
      </div>
      {!mayManage && <p className="text-caption text-muted-foreground">{t("managerOnly")}</p>}
      <ConfirmDialog
        open={removing && qr !== null}
        onOpenChange={setRemoving}
        title={t("removeTitle", { name: qr?.fileName ?? "" })}
        description={t("removeDescription")}
        action={t("remove")}
        request={remove}
        returnFocusTo={opener}
        onConfirm={() => {
          if (qr === null) return;
          remove.mutate(
            { packageId: detail.id, attachmentId: qr.attachmentId },
            {
              onSuccess: () => {
                setRemoving(false);
              },
            },
          );
        }}
      />
    </SectionCard>
  );
}
