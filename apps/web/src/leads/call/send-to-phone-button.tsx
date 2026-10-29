"use client";

// Send to my phone (release 5, scope 3.4): pushes "Call {name}" to the person's own phone, whose notification opens the
// page that dials. Needs a phone registered for push: without one the button is off and says where to turn it on. It
// works whatever the subscription says (it changes no record).
import { useMutation, useQuery } from "@tanstack/react-query";
import { SmartphoneIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { toast } from "sonner";
import { RefusalAlert } from "@/components/refusal-alert";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTRPC } from "@/data/trpc";
import { routes } from "@/lib/routes";

export function SendToPhoneButton({ leadId }: { leadId: string }) {
  const t = useTranslations("leads.call");
  const trpc = useTRPC();
  const hintId = useId();
  const device = useQuery(trpc.notifications.push.hasDevice.queryOptions());
  const send = useMutation(
    trpc.calls.sendToMyPhone.mutationOptions({
      onSuccess: () => {
        toast.success(t("sent"));
      },
    }),
  );
  // Until the answer is in, the button waits; a failed read leaves it on, and the api says why if it can't send.
  const noDevice = device.data === false;
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        className="self-start"
        aria-describedby={noDevice ? hintId : undefined}
        disabled={noDevice || send.isPending}
        onClick={() => {
          send.mutate({ leadId });
        }}
      >
        {send.isPending ? <Spinner /> : <SmartphoneIcon aria-hidden="true" />}
        {send.isPending ? t("sending") : t("sendToPhone")}
      </Button>
      {noDevice && (
        <p id={hintId} className="text-label text-muted-foreground">
          {t("needsPush")}{" "}
          <TextLink href={routes.notificationPreferences} inline>
            {t("needsPushLink")}
          </TextLink>
        </p>
      )}
      <RefusalAlert error={send.error} />
    </div>
  );
}
