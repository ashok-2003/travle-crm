"use client";

// The form's Status card (spec 3.2, item 1): the switch that takes enquiries, turned on at once and off without a
// question, and one line in the state's words. A form the subscription, the plan or a missing Owner closes says so in an
// Alert, which only the agency sees. Turning off takes a door away, so it stays open while the agency is read-only.
import type { WebsiteFormView } from "@travel-crm/contracts/website-forms";
import { CircleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import type { useWebsiteForm } from "./use-website-form";

type WebsiteForm = ReturnType<typeof useWebsiteForm>;

export function StatusCard({
  view,
  turnOn,
  turnOff,
}: {
  view: WebsiteFormView;
  turnOn: WebsiteForm["turnOn"];
  turnOff: WebsiteForm["turnOff"];
}) {
  const t = useTranslations("websiteFormSettings.status");
  const tErrors = useTranslations("errors.reasons");
  const switchId = useId();
  const lineId = useId();
  const hintId = useId();
  const { enabled } = view.settings;
  const { reason } = view.state;
  const access = useWriteAccess(enabled ? "revoke" : "change");
  const pending = turnOn.isPending || turnOff.isPending;
  const demo = reason === "demo";

  const closed =
    reason === null || reason === "off" || reason === "demo"
      ? null
      : reason === "no_owner"
        ? tErrors("FORM_NEEDS_OWNER")
        : t(`closed.${reason}`);
  const line = demo ? t("demo") : view.state.open ? t("on") : reason === "off" ? t("off") : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("heading")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Item size="sm">
          <ItemContent>
            <ItemTitle>
              <Label htmlFor={switchId}>{t("switch")}</Label>
            </ItemTitle>
            {line !== null && <ItemDescription id={lineId}>{line}</ItemDescription>}
          </ItemContent>
          <ItemActions>
            <Switch
              id={switchId}
              checked={enabled}
              disabled={demo || !access.allowed || pending}
              aria-describedby={
                [line === null ? null : lineId, access.hint === null ? null : hintId]
                  .filter((id) => id !== null)
                  .join(" ") || undefined
              }
              onCheckedChange={(next) => {
                if (next) turnOn.mutate();
                else turnOff.mutate();
              }}
            />
          </ItemActions>
        </Item>
        <WriteHint id={hintId} hint={access.hint} />
        {closed !== null && (
          <Alert>
            <CircleAlertIcon aria-hidden="true" />
            <AlertDescription>{closed}</AlertDescription>
          </Alert>
        )}
        <RefusalAlert error={turnOn.error ?? turnOff.error} />
      </CardContent>
    </Card>
  );
}
