"use client";

// "Draft packages from your documents" (Settings, AI): the AI reads what the agency told it, lists the trips it describes with the
// documents each came from, and drafts one into a package for the owner to check. A source too long for one read is offered by part
// first. Each find and each draft is one of the month's AI calls, said before it is made. The AI proposes; the owner saves.
import type { FoundTrip, FoundTrips, PackageDraft } from "@travel-crm/contracts/ai";
import { SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { ChoiceGroup } from "@/components/forms/choice-field";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { DraftReview } from "./draft-review";
import { useDraftPackage, useFindTrips } from "./use-package-drafts";

const sourcesOf = (trip: FoundTrip) => [...new Set(trip.evidence.map((line) => line.source))].join(", ");

function TripRow({
  trip,
  busy,
  drafting,
  disabled,
  onDraft,
}: {
  trip: FoundTrip;
  busy: boolean;
  drafting: boolean;
  disabled: boolean;
  onDraft: (trip: FoundTrip, opener: HTMLButtonElement | null) => void;
}) {
  const t = useTranslations("ai.drafts.section");
  const opener = useRef<HTMLButtonElement>(null);
  const where = trip.destinationName ?? trip.placeWords;
  const nights = trip.nights === null ? null : t("nights", { count: trip.nights });
  return (
    <Item variant="muted" role="listitem">
      <ItemContent>
        <ItemTitle>{trip.name}</ItemTitle>
        <ItemDescription>{[where, nights].filter((part) => part !== null && part !== "").join(" · ")}</ItemDescription>
        <ItemDescription>{t("sources", { sources: sourcesOf(trip) })}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button
          ref={opener}
          variant="outline"
          aria-label={t("draftNamed", { name: trip.name })}
          disabled={busy || disabled || trip.evidence.length === 0}
          onClick={() => {
            onDraft(trip, opener.current);
          }}
        >
          {drafting && <Spinner aria-hidden="true" />}
          {drafting ? t("drafting") : t("draft")}
        </Button>
      </ItemActions>
    </Item>
  );
}

export function DraftPackagesSection() {
  const t = useTranslations("ai.drafts.section");
  const mayPropose = useHolds("ai:suggest");
  const mayEdit = useHolds("quotes:edit");
  const mayDraft = mayPropose && mayEdit;
  const write = useWriteAccess("change");
  const finder = useFindTrips();
  const drafter = useDraftPackage();
  const [found, setFound] = useState<FoundTrips | null>(null);
  const [part, setPart] = useState("");
  const [draft, setDraft] = useState<PackageDraft | null>(null);
  const [draftingRef, setDraftingRef] = useState<string | null>(null);
  const reviewOpener = useRef<HTMLButtonElement | null>(null);
  if (!mayDraft) return null;

  const find = (chosen?: string) => {
    finder.mutate(chosen === undefined ? {} : { part: chosen }, { onSuccess: setFound });
  };
  const draftTrip = (trip: FoundTrip, opener: HTMLButtonElement | null) => {
    if (found?.fillId == null) return;
    reviewOpener.current = opener;
    setDraftingRef(trip.ref);
    drafter.mutate(
      {
        fillId: found.fillId,
        trip: { ref: trip.ref, name: trip.name, tokens: trip.evidence.map((line) => line.token) },
      },
      {
        onSuccess: setDraft,
        onSettled: () => {
          setDraftingRef(null);
        },
      },
    );
  };
  const choosing = found !== null && found.fillId === null;
  const busy = finder.isPending || drafter.isPending;
  const hintId = "draft-packages-write-hint";

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("title")}</h2>
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {choosing ? (
          <div className="flex flex-col gap-3">
            <p>{t("partsIntro", { count: found.parts.length })}</p>
            <ChoiceGroup
              legend={t("partsLabel")}
              value={part}
              onChange={setPart}
              options={found.parts.map((one) => ({ value: one.ref, label: one.label }))}
            />
            <div>
              <Button
                disabled={busy || part === "" || !write.allowed}
                aria-describedby={hintId}
                onClick={() => {
                  find(part);
                }}
              >
                {finder.isPending && <Spinner aria-hidden="true" />}
                {finder.isPending ? t("finding") : t("findInPart")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2">
            <Button
              variant="ai"
              disabled={busy || !write.allowed}
              aria-describedby={hintId}
              onClick={() => {
                find();
              }}
            >
              {finder.isPending ? <Spinner aria-hidden="true" /> : <SparklesIcon aria-hidden="true" />}
              {finder.isPending ? t("finding") : t("find")}
            </Button>
            <p className="text-caption text-muted-foreground">{t("oneCall")}</p>
          </div>
        )}
        <WriteHint id={hintId} hint={write.hint} visible />
        {found !== null && !choosing && (
          <div className="flex flex-col gap-3">
            {found.trips.length === 0 ? (
              <p>{t("none")}</p>
            ) : (
              <>
                <p className="text-caption text-muted-foreground">{t("draftCost")}</p>
                <ItemGroup className="gap-2">
                  {found.trips.map((trip) => (
                    <TripRow
                      key={trip.ref}
                      trip={trip}
                      busy={busy}
                      drafting={draftingRef === trip.ref}
                      disabled={!write.allowed}
                      onDraft={draftTrip}
                    />
                  ))}
                </ItemGroup>
              </>
            )}
          </div>
        )}
        <RefusalAlert error={finder.error ?? drafter.error} />
      </CardContent>
      {draft !== null && (
        <DraftReview
          key={draft.tripRef}
          draft={draft}
          open
          returnFocusTo={reviewOpener}
          onOpenChange={(open) => {
            if (!open) setDraft(null);
          }}
        />
      )}
    </Card>
  );
}
