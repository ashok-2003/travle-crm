"use client";

// One section of a trip's page (/packages/<id>): a card with the section's heading and a short read-only summary, and
// Edit, which swaps the summary for the section's own form. Save sends that section's fields alone (packages.updatePart)
// and Cancel puts the summary back. The cards that belong to the section (seasons, photos) follow the card inside the
// same anchor, never inside it (DESIGN.md: no nested cards), so a link to the section lands on all of it.
import type { UpdatePackagePartInput } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type ReactNode, type SubmitEventHandler } from "react";
import { toast } from "sonner";
import { FormAlert, type Sending } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldSet } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { usePackageChanges } from "./use-packages";

/** Where each section starts: the side index and the AI-sell card's gaps link here. */
export const sectionAnchors = {
  prices: "prices-and-dates",
  itinerary: "itinerary",
  details: "details-and-rules",
  page: "page-and-files",
} as const;
export type SectionKey = keyof typeof sectionAnchors;

export function PackageSection({
  section,
  summary,
  editor,
  children,
}: {
  section: SectionKey;
  summary: ReactNode;
  /** The section's form, given what closes it: mounted only while editing, so each Edit starts from what is saved. */
  editor: (close: () => void) => ReactNode;
  /** The section's own cards, after its summary. */
  children?: ReactNode;
}) {
  const t = useTranslations("packages.sections");
  const title = t(`${section}.title`);
  const headingId = useId();
  const hintId = `${headingId}-write`;
  const mayEdit = useHolds("quotes:edit");
  const access = useWriteAccess("change");
  // "closed" is the summary again after an edit: Edit and Cancel each leave the page, so the focus goes to the form that
  // opened, or back to Edit.
  const [mode, setMode] = useState<"summary" | "editing" | "closed">("summary");
  const editing = mode === "editing";
  const editButton = useRef<HTMLButtonElement>(null);
  const editorBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (mode === "editing") editorBox.current?.focus();
    if (mode === "closed") editButton.current?.focus();
  }, [mode]);
  return (
    <section id={sectionAnchors[section]} aria-labelledby={headingId} className="flex scroll-mt-6 flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 id={headingId}>{title}</h2>
          </CardTitle>
          {mayEdit && !editing && (
            <CardAction className="flex flex-col items-end">
              <Button
                ref={editButton}
                variant="outline"
                aria-label={t("editNamed", { section: title })}
                disabled={!access.allowed}
                aria-describedby={access.allowed ? undefined : hintId}
                onClick={() => {
                  setMode("editing");
                }}
              >
                {t("edit")}
              </Button>
              <WriteHint id={hintId} hint={access.hint} />
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {editing ? (
            <div ref={editorBox} tabIndex={-1} role="group" aria-labelledby={headingId}>
              {editor(() => {
                setMode("closed");
              })}
            </div>
          ) : (
            summary
          )}
        </CardContent>
      </Card>
      {children}
    </section>
  );
}

/** A section's save: only its fields go, and once saved (the trip read again) it says so and closes. */
export function useSectionSave(section: SectionKey, close: () => void) {
  const t = useTranslations("packages.sections");
  const { updatePart } = usePackageChanges();
  const save = (input: UpdatePackagePartInput) => {
    updatePart.mutate(input, {
      onSuccess: () => {
        toast.success(t("saved", { section: t(`${section}.title`) }));
        close();
      },
    });
  };
  return { updatePart, save };
}

/** A section's form: its fields, its problem or the api's refusal, then Save and Cancel. */
export function SectionForm({
  onSubmit,
  sending,
  problem,
  onCancel,
  children,
}: {
  onSubmit: SubmitEventHandler<HTMLFormElement>;
  sending: Pick<Sending<never>, "isPending" | "error">;
  problem: string | undefined;
  onCancel: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("packages.sections");
  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={onSubmit}>
      <FieldSet disabled={sending.isPending}>{children}</FieldSet>
      <FormAlert sending={sending} problem={problem} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={sending.isPending}>
          {sending.isPending && <Spinner aria-hidden="true" />}
          {sending.isPending ? t("saving") : t("save")}
        </Button>
        <Button type="button" variant="outline" disabled={sending.isPending} onClick={onCancel}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
