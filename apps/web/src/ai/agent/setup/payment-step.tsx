"use client";

// Setup step "Payment QR": the QR the agent needs to ask for an advance, and the optional UPI ID and bank account it sends with it. Money, so only
// whoever manages settings sees the editor (the api checks); it needs the business profile saved first.
import {
  savePaymentDetailsInput,
  type PaymentDetails,
  type SavePaymentDetailsInput,
} from "@travel-crm/contracts/profile";
import { CircleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { useProfile } from "@/business/profile/use-profile";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { checked } from "@/components/forms/checked";
import { TextField } from "@/components/forms/text-field";
import { useCheckedForm } from "@/components/forms/use-checked-form";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { RefusalAlert } from "@/components/refusal-alert";
import { TextLink } from "@/components/text-link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { formatFileSize } from "@/files/file-size";
import { routes } from "@/lib/routes";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { paymentQrLimit, paymentQrProblem } from "./payment-qr-check";
import { useAgentSetup } from "../use-agent";
import { usePaymentDetails, usePaymentDetailsChanges } from "./use-setup-steps";

const QR_TYPES = "image/jpeg,image/png,image/webp";

interface PaymentValues {
  upiId: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifsc: string;
}

type Problem = keyof PaymentValues | "required";

const valuesOf = (details: PaymentDetails): PaymentValues => ({
  upiId: details.upiId ?? "",
  bankName: details.bankName ?? "",
  accountName: details.accountName ?? "",
  accountNumber: details.accountNumber ?? "",
  ifsc: details.ifsc ?? "",
});

const fieldOf = (path: readonly PropertyKey[]): keyof PaymentValues | undefined => {
  const [key] = path;
  return key === "upiId" || key === "bankName" || key === "accountName" || key === "accountNumber" || key === "ifsc"
    ? key
    : undefined;
};

const toPaymentInput = (values: PaymentValues) =>
  checked(savePaymentDetailsInput.safeParse(values), values, fieldOf, (field): Problem => field);

function QrPicker({ details }: { details: PaymentDetails }) {
  const t = useTranslations("aiAgent.setup.payment");
  const id = useId();
  const hintId = `${id}-write`;
  const access = useWriteAccess("change");
  const { addQr, remove } = usePaymentDetailsChanges();
  // The QR is required: without it a switched-on agent answers nobody, and the dialog says so.
  const agentOn = useAgentSetup().data?.on === true;
  const [removing, setRemoving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const qr = details.qr;
  return (
    <div className="flex flex-col gap-3">
      <h4 className="font-medium">{t("qr")}</h4>
      {qr === null ? (
        <p className="text-muted-foreground">{t("noQr")}</p>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <TextLink newTab href={qr.url}>
            {qr.fileName}
          </TextLink>
          <Button
            variant="ghost"
            disabled={!access.allowed || remove.isPending}
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
      {problem !== null && (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      )}
      <RefusalAlert error={addQr.error} />
      <input
        ref={picker}
        type="file"
        accept={QR_TYPES}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="payment-qr-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file === undefined) return;
          const wrong = paymentQrProblem(file);
          setProblem(wrong === null ? null : t(`problems.${wrong}`, { size: formatFileSize(paymentQrLimit) }));
          if (wrong === null) addQr.mutate(file);
        }}
      />
      <div>
        <Button
          variant="outline"
          disabled={!access.allowed || addQr.isPending}
          aria-describedby={access.allowed ? undefined : hintId}
          onClick={() => picker.current?.click()}
        >
          {addQr.isPending && <Spinner aria-hidden="true" />}
          {addQr.isPending ? t("adding") : qr === null ? t("addQr") : t("replaceQr")}
        </Button>
        <WriteHint id={hintId} hint={access.hint} />
      </div>
      <ConfirmDialog
        open={removing && qr !== null}
        onOpenChange={setRemoving}
        title={t("removeTitle", { name: qr?.fileName ?? "" })}
        description={t(agentOn ? "removeDescriptionOn" : "removeDescription")}
        action={t("remove")}
        request={remove}
        returnFocusTo={opener}
        onConfirm={() => {
          if (qr === null) return;
          remove.mutate(
            { attachmentId: qr.id },
            {
              onSuccess: () => {
                setRemoving(false);
              },
            },
          );
        }}
      />
    </div>
  );
}

function PaymentForm({ details }: { details: PaymentDetails }) {
  const t = useTranslations("aiAgent.setup.payment");
  const id = useId();
  const hintId = `${id}-write`;
  const access = useWriteAccess("change");
  const { save } = usePaymentDetailsChanges();
  const { form, onSubmit, formProblem } = useCheckedForm<PaymentValues, SavePaymentDetailsInput, Problem>(
    valuesOf(details),
    toPaymentInput,
    (problem) => t(`problems.${problem}`),
  );
  const disabled = !access.allowed || save.isPending;
  return (
    <form
      noValidate
      onSubmit={onSubmit((input) => {
        save.mutate(input, { onSuccess: () => toast.success(t("saved")) });
      })}
      className="flex flex-col gap-4"
    >
      <FieldGroup>
        <TextField control={form.control} name="upiId" label={t("upiId")} autoCapitalize="none" spellCheck={false} />
        <TextField control={form.control} name="bankName" label={t("bankName")} />
        <TextField control={form.control} name="accountName" label={t("accountName")} />
        <TextField
          control={form.control}
          name="accountNumber"
          label={t("accountNumber")}
          inputMode="numeric"
          autoComplete="off"
        />
        <TextField
          control={form.control}
          name="ifsc"
          label={t("ifsc")}
          autoCapitalize="characters"
          spellCheck={false}
        />
      </FieldGroup>
      {formProblem !== undefined && <p role="alert">{formProblem}</p>}
      <RefusalAlert error={save.error} />
      <div>
        <Button type="submit" disabled={disabled} aria-describedby={access.allowed ? undefined : hintId}>
          {save.isPending ? t("saving") : t("save")}
        </Button>
        <WriteHint id={hintId} hint={access.hint} />
      </div>
    </form>
  );
}

export function PaymentStepEditor() {
  const t = useTranslations("aiAgent.setup.payment");
  const profile = useProfile();
  const details = usePaymentDetails(profile.data !== undefined && profile.data !== null);
  if (profile.isError) {
    return <LoadFailedAlert message={t("loadFailed")} error={profile.error} onRetry={() => void profile.refetch()} />;
  }
  if (profile.data === undefined) return <LoadingRows shape="twoLines" label={t("loading")} />;
  if (profile.data === null) {
    return (
      <p className="text-muted-foreground">
        <TextLink href={routes.profile}>{t("profileFirst")}</TextLink>
      </p>
    );
  }
  if (details.data === undefined) {
    return details.isError ? (
      <LoadFailedAlert message={t("loadFailed")} error={details.error} onRetry={() => void details.refetch()} />
    ) : (
      <LoadingRows shape="twoLines" label={t("loading")} />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <QrPicker details={details.data} />
      <div className="flex flex-col gap-3">
        <h4 className="font-medium">{t("extras")}</h4>
        <PaymentForm key={JSON.stringify(valuesOf(details.data))} details={details.data} />
      </div>
    </div>
  );
}
