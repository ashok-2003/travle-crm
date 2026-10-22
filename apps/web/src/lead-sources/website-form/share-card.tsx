"use client";

// The Share card (spec 3.2, item 2): the form's address to copy, open or replace, and the website switch with the
// snippet. The address is read-only and stored in the clear, so the Owner can copy it again. Before the form is first
// saved there is no address yet. Change the link takes a door away, so it asks `revoke` and stays open while read-only.
import type { WebsiteFormView } from "@travel-crm/contracts/website-forms";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { Controller, type Control } from "react-hook-form";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldDescription } from "@/components/ui/field";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import { Item, ItemActions, ItemContent, ItemTitle } from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { ChangeLinkDialog } from "./change-link-dialog";
import type { FormValues } from "./form-values";
import { SnippetDialog } from "./snippet-dialog";

export function ShareCard({ view, control }: { view: WebsiteFormView; control: Control<FormValues> }) {
  const t = useTranslations("websiteFormSettings.share");
  const revoke = useWriteAccess("revoke");
  const [asking, setAsking] = useState(false);
  const [showSnippet, setShowSnippet] = useState(false);
  const changeButton = useRef<HTMLButtonElement>(null);
  const snippetButton = useRef<HTMLButtonElement>(null);
  const hintId = useId();
  const embedId = useId();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("heading")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {view.link === null ? (
          <FieldDescription>{t("noLink")}</FieldDescription>
        ) : (
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${embedId}-link`}>{t("link")}</Label>
            <InputGroup>
              <InputGroupInput
                id={`${embedId}-link`}
                readOnly
                value={view.link}
                aria-label={t("linkLabel")}
                className="numbers"
              />
            </InputGroup>
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton value={view.link} label={t("copyLink")} />
              <Button variant="outline" asChild>
                <a href={view.link} target="_blank" rel="noopener noreferrer">
                  {t("open")}
                </a>
              </Button>
              <Button
                ref={changeButton}
                type="button"
                variant="outline"
                disabled={!revoke.allowed}
                aria-describedby={revoke.hint === null ? undefined : hintId}
                onClick={() => {
                  setAsking(true);
                }}
              >
                {t("changeLink")}
              </Button>
            </div>
            <WriteHint id={hintId} hint={revoke.hint} />
            <ChangeLinkDialog open={asking} onOpenChange={setAsking} returnFocusTo={changeButton} />
          </div>
        )}
        <Controller
          control={control}
          name="allowEmbed"
          render={({ field }) => (
            <>
              <Item size="sm">
                <ItemContent>
                  <ItemTitle>
                    <Label htmlFor={embedId}>{t("embed")}</Label>
                  </ItemTitle>
                </ItemContent>
                <ItemActions>
                  <Switch id={embedId} checked={field.value} onCheckedChange={field.onChange} />
                </ItemActions>
              </Item>
              {view.key !== null && (
                <>
                  <div>
                    <Button
                      ref={snippetButton}
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowSnippet(true);
                      }}
                    >
                      {t("copySnippet")}
                    </Button>
                  </div>
                  <SnippetDialog
                    open={showSnippet}
                    onOpenChange={setShowSnippet}
                    returnFocusTo={snippetButton}
                    formKey={view.key}
                    allowEmbed={field.value}
                    savedAllowEmbed={view.settings.allowEmbed}
                    onAllowEmbed={field.onChange}
                  />
                </>
              )}
            </>
          )}
        />
        <FieldDescription>{t("tryIt")}</FieldDescription>
      </CardContent>
    </Card>
  );
}
