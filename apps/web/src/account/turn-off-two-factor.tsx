"use client";

// Turning two-factor sign-in off, which Better Auth allows only with the password. Not offered while the
// organization requires two-factor (the api would then send the person straight back to set it up). Once sent, the
// dialog stays until Better Auth answers.
import { useTranslations } from "next-intl";
import { useId, useState, type SubmitEvent } from "react";
import { toast } from "sonner";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { authClient, type AuthClient } from "@/data/auth-client";
import { AuthFailureAlert, type AuthFailure } from "./form-alert";

export function TurnOffTwoFactor({
  onTurnedOff,
  auth = authClient,
}: {
  onTurnedOff: () => Promise<void> | void;
  auth?: Pick<AuthClient, "turnOffTwoFactor">;
}) {
  const t = useTranslations("account");
  const tCommon = useTranslations("common");
  const id = useId();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setFailure(null);
    const result = await auth.turnOffTwoFactor({ password });
    setBusy(false);
    if (!result.ok) {
      setFailure(result);
      return;
    }
    setOpen(false);
    toast.success(t("account.turnedOff"));
    await onTurnedOff();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setOpen(next);
        setPassword("");
        setFailure(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive">{t("account.turnOff")}</Button>
      </DialogTrigger>
      <DialogContent>
        <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{t("account.turnOffTitle")}</DialogTitle>
            <DialogDescription>{t("account.turnOffIntro")}</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor={`${id}-password`}>{t("fields.password")}</FieldLabel>
            <PasswordInput
              id={`${id}-password`}
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          </Field>
          <AuthFailureAlert failure={failure} />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={busy}>
                {tCommon("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={busy || password === ""}>
              {busy && <Spinner />}
              {busy ? t("account.turningOff") : t("account.turnOff")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
