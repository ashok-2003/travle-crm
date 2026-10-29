"use client";

// /settings/notifications (the owner, 2026-10-29): who on the team hears what. Each member can get their notifications
// by email too, and can get a copy of every team alert (a booking, a payment screenshot, a hot lead, the AI asking for
// a person...), whoever it was for. Each person's own choices (Notifications in their account) still apply.
import type { TeamRouting } from "@travel-crm/contracts/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { BackToSettings } from "@/components/back-to-settings";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { RefusalAlert } from "@/components/refusal-alert";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useTRPC } from "@/data/trpc";
import { routes } from "@/lib/routes";
import { useWriteAccess } from "@/subscription/write-access";

const toggled = (ids: readonly string[], id: string, on: boolean) =>
  on ? [...new Set([...ids, id])] : ids.filter((one) => one !== id);

function RoutingForm({ saved }: { saved: TeamRouting }) {
  const t = useTranslations("notifications.team");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const access = useWriteAccess("change");
  const save = useMutation(
    trpc.notifications.teamRouting.save.mutationOptions({
      onSuccess: () => {
        toast.success(t("saved"));
        return queryClient.invalidateQueries({ queryKey: trpc.notifications.teamRouting.get.queryKey() });
      },
    }),
  );
  const [emailUserIds, setEmail] = useState(saved.emailUserIds);
  const [copyUserIds, setCopy] = useState(saved.copyUserIds);
  const dirty =
    JSON.stringify([...emailUserIds].sort()) !== JSON.stringify([...saved.emailUserIds].sort()) ||
    JSON.stringify([...copyUserIds].sort()) !== JSON.stringify([...saved.copyUserIds].sort());
  const busy = save.isPending || !access.allowed;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("membersTitle")}</h2>
        </CardTitle>
        <CardDescription>{t("membersDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ItemGroup className="gap-2">
          {saved.members.map((member) => {
            const emailId = `email-${member.userId}`;
            const copyId = `copy-${member.userId}`;
            return (
              <Item key={member.userId} variant="muted" role="listitem">
                <ItemContent>
                  <ItemTitle>{member.name}</ItemTitle>
                  {!member.hasEmail && <ItemDescription>{t("noEmail")}</ItemDescription>}
                </ItemContent>
                <ItemActions className="flex-wrap gap-4">
                  <div className="flex min-h-11 items-center gap-2">
                    <Switch
                      id={emailId}
                      checked={emailUserIds.includes(member.userId)}
                      disabled={busy || !member.hasEmail}
                      onCheckedChange={(on) => {
                        setEmail((ids) => toggled(ids, member.userId, on));
                      }}
                    />
                    <Label htmlFor={emailId}>{t("email")}</Label>
                  </div>
                  <div className="flex min-h-11 items-center gap-2">
                    <Switch
                      id={copyId}
                      checked={copyUserIds.includes(member.userId)}
                      disabled={busy}
                      onCheckedChange={(on) => {
                        setCopy((ids) => toggled(ids, member.userId, on));
                      }}
                    />
                    <Label htmlFor={copyId}>{t("copies")}</Label>
                  </div>
                </ItemActions>
              </Item>
            );
          })}
        </ItemGroup>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            disabled={busy || !dirty}
            onClick={() => {
              save.mutate({ emailUserIds, copyUserIds });
            }}
          >
            {save.isPending && <Spinner aria-hidden="true" />}
            {save.isPending ? t("saving") : t("save")}
          </Button>
          <span className="text-caption text-muted-foreground" aria-live="polite">
            {dirty ? t("unsaved") : t("allSaved")}
          </span>
        </div>
        <RefusalAlert error={save.error} />
      </CardContent>
    </Card>
  );
}

export function TeamRoutingScreen() {
  const t = useTranslations("notifications.team");
  const trpc = useTRPC();
  const routing = useQuery(trpc.notifications.teamRouting.get.queryOptions());
  return (
    <div className="flex max-w-[820px] flex-col gap-6">
      <BackToSettings />
      <PageHeader title={t("title")} intro={t("intro")} />
      <Card size="sm">
        <CardContent className="flex flex-col gap-2">
          <p className="font-semibold">{t("whatTitle")}</p>
          <p className="text-muted-foreground">{t("emailMeaning")}</p>
          <p className="text-muted-foreground">{t("copiesMeaning")}</p>
          <p className="text-caption text-muted-foreground">
            {t.rich("own", {
              link: (chunks) => (
                <TextLink inline href={routes.notificationPreferences}>
                  {chunks}
                </TextLink>
              ),
            })}
          </p>
        </CardContent>
      </Card>
      {routing.data ? (
        <RoutingForm saved={routing.data} />
      ) : routing.isError ? (
        <ErrorState
          message={t("loadFailed")}
          error={routing.error}
          retryLabel={t("retry")}
          onRetry={() => void routing.refetch()}
        />
      ) : (
        <LoadingRows shape="twoLines" label={t("loading")} />
      )}
    </div>
  );
}
