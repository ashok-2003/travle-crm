"use client";

// The offers consent on a person's card (website form spec 3.9): "Agreed to offers on 22 Oct, from the website form" with
// Record that they stopped, because a person may ask by WhatsApp; a person who withdrew shows "Asked to stop offers on
// 3 Nov" alone; one who never agreed shows nothing. Behind the consent switch (spec 0.1.2): with it off the card
// shows nothing and asks nothing.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { features } from "@travel-crm/contracts/features";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Details } from "@/components/details";
import { Button } from "@/components/ui/button";
import { useRefreshWork } from "@/data/use-refresh-work";
import { useTRPC } from "@/data/trpc";
import { formatDay } from "@/lib/format";
import { useHolds, useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";

export function PersonConsent({ leadId, personName }: { leadId: string; personName: string }) {
  return features.marketingConsent ? <ConsentLine leadId={leadId} personName={personName} /> : null;
}

function ConsentLine({ leadId, personName }: { leadId: string; personName: string }) {
  const t = useTranslations("websiteFormSettings.consent");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refreshWork = useRefreshWork();
  const { timeZone } = useMe().organization;
  const canEdit = useHolds("leads:edit");
  const write = useWriteAccess("change");
  const [asking, setAsking] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const hintId = useId();
  const consent = useQuery(trpc.people.consent.queryOptions({ leadId }));
  const withdraw = useMutation(
    trpc.people.withdrawConsent.mutationOptions({
      onSuccess: async (state) => {
        queryClient.setQueryData(trpc.people.consent.queryKey({ leadId }), state);
        setAsking(false);
        await refreshWork();
      },
    }),
  );

  const state = consent.data;
  if (state?.state == null || state.at === null) return null;
  const day = formatDay(new Date(state.at), { timeZone });

  if (state.state === "withdrawn") {
    return <Details rows={[{ label: t("label"), value: t("withdrawn", { day }) }]} />;
  }
  return (
    <>
      <Details
        rows={[
          {
            label: t("label"),
            value: t(state.fromForm ? "grantedFromForm" : "granted", { day }),
            action: canEdit && (
              <div className="flex flex-col items-end gap-1">
                <Button
                  ref={opener}
                  variant="ghost"
                  disabled={!write.allowed}
                  aria-describedby={write.hint === null ? undefined : hintId}
                  onClick={() => {
                    setAsking(true);
                  }}
                >
                  {t("stopped")}
                </Button>
                <WriteHint id={hintId} hint={write.hint} />
              </div>
            ),
          },
        ]}
      />
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        returnFocusTo={opener}
        title={t("confirm.title")}
        description={t("confirm.description", { name: personName })}
        action={t("confirm.action")}
        request={withdraw}
        onConfirm={() => {
          withdraw.mutate({ leadId });
        }}
      />
    </>
  );
}
