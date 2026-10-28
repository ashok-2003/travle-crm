"use client";

// An invited Owner's own password (the invite program, the owner, 2026-10-28): they came in through their link with a
// password the platform made and never saw, so a banner asks them to choose one, and says how they sign in afterwards
// (their organization's code and "owner", or their email). Choosing it needs no old password; once chosen, the link
// signs them in no more, and the banner goes.
import { newPassword } from "@travel-crm/contracts/identity";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRoundIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { RefusalAlert } from "@/components/refusal-alert";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useTRPC } from "@/data/trpc";
import { useMe } from "@/session/me-context";

export function OwnPasswordBanner() {
  const t = useTranslations("account.ownPassword");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const me = useMe();
  const state = useQuery({ ...trpc.me.ownPassword.queryOptions(), staleTime: 5 * 60_000 });
  const choose = useMutation(
    trpc.me.chooseOwnPassword.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.me.ownPassword.queryKey() }),
    }),
  );
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const formId = useId();
  const ids = { password: useId(), again: useId() };
  if (state.data?.toChoose !== true) return null;

  const signInWith = t("signInWith", {
    code: me.organization.code,
    username: me.user.username?.split(":").at(-1) ?? "owner",
  });
  return (
    <div className="px-4 pt-3 sm:px-6 lg:px-8">
      <Alert>
        <KeyRoundIcon aria-hidden="true" />
        <AlertTitle>{t("title")}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          <span>{t("description")}</span>
          <Button
            ref={opener}
            size="sm"
            onClick={() => {
              setOpen(true);
            }}
          >
            {t("choose")}
          </Button>
        </AlertDescription>
      </Alert>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        busy={choose.isPending}
        returnFocusTo={opener}
        title={t("dialogTitle")}
        description={signInWith}
        footer={
          <Button type="submit" form={formId} disabled={choose.isPending}>
            {choose.isPending && <Spinner aria-hidden="true" />}
            {t("save")}
          </Button>
        }
      >
        <form
          id={formId}
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const checked = newPassword.safeParse(password);
            if (!checked.success) {
              setProblem(checked.error.issues[0]?.message ?? t("tooShort"));
              return;
            }
            if (password !== again) {
              setProblem(t("differ"));
              return;
            }
            setProblem(null);
            choose.mutate(
              { password },
              {
                onSuccess: (result) => {
                  toast.success(result.chosen ? t("saved") : t("alreadyChosen"));
                  setOpen(false);
                },
              },
            );
          }}
        >
          <Field>
            <FieldLabel htmlFor={ids.password}>{t("password")}</FieldLabel>
            <Input
              id={ids.password}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
            <FieldDescription>{t("hint")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.again}>{t("again")}</FieldLabel>
            <Input
              id={ids.again}
              type="password"
              autoComplete="new-password"
              value={again}
              onChange={(event) => {
                setAgain(event.target.value);
              }}
            />
            {problem !== null && <FieldError>{problem}</FieldError>}
          </Field>
          <RefusalAlert error={choose.error} />
        </form>
      </ResponsiveDialog>
    </div>
  );
}
