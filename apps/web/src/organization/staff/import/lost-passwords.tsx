"use client";

// A staff import's passwords once they are gone from this tab (spec 3.4, B50): another tab, a reload, or a sheet lost.
// "These passwords were shown once." and a way to give new ones to the people who haven't signed in yet, one person at
// a time through the existing password reset; someone who already chose their own is left alone. The new passwords go
// to this tab's memory like the first ones (password-store.ts), and the call's variables are the people, never them.
import { useMutation } from "@tanstack/react-query";
import type { StaffImportedPerson } from "@travel-crm/contracts/identity";
import { InfoIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTRPCClient } from "@/data/trpc";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { temporaryPassword } from "../temporary-password";
import { passwordStore } from "./password-store";

export function LostPasswords({
  importId,
  waiting,
  onMade,
}: {
  importId: string;
  /** The people who still have the temporary password, which no one can see now. */
  waiting: readonly StaffImportedPerson[];
  onMade: () => void;
}) {
  const t = useTranslations("staff.import.lost");
  const hintId = useId();
  const write = useWriteAccess("revoke");
  const client = useTRPCClient();
  const make = useMutation({
    networkMode: "always",
    gcTime: 0,
    mutationFn: async (people: readonly StaffImportedPerson[]) => {
      for (const person of people) {
        const password = temporaryPassword();
        await client.staff.resetPassword.mutate({ memberId: person.memberId, temporaryPassword: password });
        passwordStore.add(importId, new Map([[person.rowNumber, password]]));
      }
    },
    // Whoever was done before a failure keeps the new password already shown.
    onSettled: onMade,
  });
  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <InfoIcon aria-hidden="true" />
        <AlertDescription>{waiting.length === 0 ? t("everyoneSignedIn") : t("shownOnce")}</AlertDescription>
      </Alert>
      {waiting.length > 0 && (
        <div className="flex flex-col items-start gap-2">
          <Button
            disabled={!write.allowed || make.isPending}
            aria-describedby={write.hint ? hintId : undefined}
            onClick={() => {
              make.mutate(waiting);
            }}
          >
            {make.isPending && <Spinner />}
            {t("make", { count: waiting.length })}
          </Button>
          <WriteHint id={hintId} hint={write.hint} />
          <RefusalAlert error={make.error} />
        </div>
      )}
    </div>
  );
}
