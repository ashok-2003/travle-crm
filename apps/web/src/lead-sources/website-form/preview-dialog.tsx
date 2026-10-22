"use client";

// Preview (spec 3.4): the visitors' own form component, built by the api from the settings now on the page (saved or
// not), in a frame as wide as a phone or a computer, with Send off. It is the page's button and its dialog together:
// the button reads the form's values when it is pressed, and answers for them if they do not pass the contract's checks.
import { skipToken, useQuery } from "@tanstack/react-query";
import type { SaveWebsiteFormInput } from "@travel-crm/contracts/website-forms";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTRPC } from "@/data/trpc";
import { WebsiteFormView } from "@/website-form/website-form-view";
import { checkValues, type FormValues } from "./form-values";

type Frame = "phone" | "computer";
const frameWidths: Record<Frame, number> = { phone: 390, computer: 960 };

/** What the form looks like for these settings; `input` is null when they don't pass the contract's checks. */
function PreviewBody({ input, frame }: { input: SaveWebsiteFormInput | null; frame: Frame }) {
  const t = useTranslations("websiteFormSettings.preview");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  const preview = useQuery(trpc.websiteForm.preview.queryOptions(input ?? skipToken));
  if (input === null) {
    return (
      <Alert>
        <AlertDescription>{t("fix")}</AlertDescription>
      </Alert>
    );
  }
  if (preview.data === undefined) {
    return preview.isError ? (
      <ErrorState
        message={t("loadFailed")}
        error={preview.error}
        retryLabel={tCommon("tryAgain")}
        onRetry={() => void preview.refetch()}
      />
    ) : (
      <LoadingRows rows={4} shape="twoLines" />
    );
  }
  return (
    <div className="overflow-x-auto">
      <WebsiteFormView
        mode="preview"
        form={preview.data}
        width={frameWidths[frame]}
        send={() => Promise.reject(new Error("A preview sends nothing"))}
      />
    </div>
  );
}

export function PreviewButton({ getValues }: { getValues: () => FormValues }) {
  const t = useTranslations("websiteFormSettings.preview");
  const [shown, setShown] = useState<{ input: SaveWebsiteFormInput | null } | null>(null);
  const [frame, setFrame] = useState<Frame>("computer");
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <>
      <div>
        <Button
          ref={opener}
          type="button"
          variant="outline"
          onClick={() => {
            const checked = checkValues(getValues());
            setShown({ input: checked.ok ? checked.input : null });
          }}
        >
          {t("button")}
        </Button>
      </div>
      <ResponsiveDialog
        open={shown !== null}
        onOpenChange={(open) => {
          if (!open) setShown(null);
        }}
        returnFocusTo={opener}
        title={t("title")}
        description={t("description")}
        cancel={false}
        footer={
          <Button
            type="button"
            onClick={() => {
              setShown(null);
            }}
          >
            {t("done")}
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <ToggleGroup
            type="single"
            variant="outline"
            aria-label={t("size")}
            value={frame}
            onValueChange={(next) => {
              if (next === "phone" || next === "computer") setFrame(next);
            }}
          >
            <ToggleGroupItem value="phone">{t("phone")}</ToggleGroupItem>
            <ToggleGroupItem value="computer">{t("computer")}</ToggleGroupItem>
          </ToggleGroup>
          {shown !== null && <PreviewBody input={shown.input} frame={frame} />}
        </div>
      </ResponsiveDialog>
    </>
  );
}
