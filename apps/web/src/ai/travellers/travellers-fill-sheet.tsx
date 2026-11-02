"use client";

// "Fill with AI" for a booking's travellers (release ai3): say who is travelling, type or paste a list, or show a photo of a list
// or an ID; the AI proposes each person's details and the row they fill; staff tick what to take and save the ticked travellers in
// one go, through the travellers' own save (audited as drafted by AI, approved by the member). A recording or photo is stored
// as a sensitive file, opened only by those who may read IDs; a photo is offered only to them. Nothing is saved by reading.
import type { AiFillProposal, FillTraveller } from "@travel-crm/contracts/ai";
import type { BookingDetail } from "@travel-crm/contracts/bookings";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { RefusalAlert } from "@/components/refusal-alert";
import type { ReturnFocusTo } from "@/components/return-focus";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useBookingChanges } from "@/bookings/use-bookings";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { FillSourceFields } from "../fill/fill-source-fields";
import { useFill } from "../fill/use-ai-fill";
import { useFillSource } from "../fill/use-fill-source";
import { entriesOf, fieldsOf, startsTicked, type TravellerFieldKey } from "./traveller-fields";
import { TravellersReview } from "./travellers-review";

const keyOf = (index: number, key: TravellerFieldKey) => `${String(index)}:${key}`;

export function TravellersFillSheet({
  booking,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  booking: BookingDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo?: ReturnFocusTo | undefined;
}) {
  const t = useTranslations("ai.travellers.sheet");
  const fill = useFill("travellers");
  const { saveTravellers } = useBookingChanges();
  const mayReadIds = useHolds("documents:view_sensitive");
  const access = useWriteAccess("change");
  // A voice note may say a passport number, and a photo may be one: both go up as sensitive files.
  const source = useFillSource({ sensitive: true });
  const [problem, setProblem] = useState<unknown>(null);
  const [proposal, setProposal] = useState<AiFillProposal | null>(null);
  const [chosen, setChosen] = useState<(string | null)[]>([]);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const busy = source.busy || fill.isPending || saveTravellers.isPending;
  const people: FillTraveller[] = (proposal?.fields[0]?.value as FillTraveller[] | undefined) ?? [];

  const ticksFor = (index: number, rowId: string | null) => {
    const person = people[index];
    const row = booking.travellers.find((one) => one.id === rowId);
    return person === undefined
      ? []
      : fieldsOf(person)
          .filter((key) => startsTicked(person, row, key))
          .map((key) => keyOf(index, key));
  };

  const show = (next: AiFillProposal) => {
    const found = (next.fields[0]?.value as FillTraveller[] | undefined) ?? [];
    setProposal(next);
    setChosen(found.map((person) => person.travellerId));
    setTicked(
      new Set(
        found.flatMap((person, index) => {
          const row = booking.travellers.find((one) => one.id === person.travellerId);
          return fieldsOf(person)
            .filter((key) => startsTicked(person, row, key))
            .map((key) => keyOf(index, key));
        }),
      ),
    );
  };

  async function run() {
    setProblem(null);
    try {
      show(await fill.mutateAsync({ target: "travellers", subjectId: booking.id, source: await source.build() }));
    } catch (error) {
      setProblem(error);
    }
  }

  const changeOpen = (next: boolean) => {
    if (!next) {
      source.reset();
      setProposal(null);
      setProblem(null);
    }
    onOpenChange(next);
  };

  const entries =
    proposal === null
      ? []
      : entriesOf(
          people,
          (index) => chosen[index] ?? null,
          (index, key) => ticked.has(keyOf(index, key)),
        );
  const twice = chosen.filter((id, index) => id !== null && chosen.indexOf(id) !== index).length > 0;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={changeOpen}
      busy={busy}
      returnFocusTo={returnFocusTo}
      title={t("title")}
      description={proposal === null ? t("description") : t("reviewDescription")}
      footer={
        proposal === null ? (
          <Button disabled={!source.ready || busy || source.recorder.recording} onClick={() => void run()}>
            {busy && <Spinner />}
            {busy ? t("reading") : t("read")}
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setProposal(null);
              }}
            >
              {t("back")}
            </Button>
            <Button
              disabled={entries.length === 0 || twice || busy || !access.allowed}
              aria-describedby="travellers-fill-hint"
              onClick={() => {
                saveTravellers.mutate(
                  {
                    bookingId: booking.id,
                    travellers: entries,
                    aiFill: { fillId: proposal.fillId, paths: ["travellers"] },
                  },
                  {
                    onSuccess: () => {
                      toast.success(t("saved", { count: entries.length }));
                      changeOpen(false);
                    },
                  },
                );
              }}
            >
              {saveTravellers.isPending && <Spinner />}
              {t("save", { count: entries.length })}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {proposal === null ? (
          <FillSourceFields
            source={source}
            busy={busy}
            allowImage={mayReadIds}
            imageLabel={t("addPhoto")}
            textLabel={t("textLabel")}
            textHint={mayReadIds ? t("textHint") : t("textHintNoPhotos")}
          />
        ) : (
          <>
            {proposal.questions.length > 0 && (
              <ul className="list-disc pl-4 text-muted-foreground">
                {proposal.questions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            )}
            {people.length === 0 && <p>{t("nobody")}</p>}
            <TravellersReview
              people={people}
              rows={booking.travellers}
              chosen={chosen}
              isTicked={(index, key) => ticked.has(keyOf(index, key))}
              onRow={(index, rowId) => {
                setChosen((before) => before.map((id, at) => (at === index ? rowId : id)));
                setTicked((before) => {
                  const next = new Set([...before].filter((one) => !one.startsWith(`${String(index)}:`)));
                  for (const one of ticksFor(index, rowId)) next.add(one);
                  return next;
                });
              }}
              onTick={(index, key, on) => {
                setTicked((before) => {
                  const next = new Set(before);
                  if (on) next.add(keyOf(index, key));
                  else next.delete(keyOf(index, key));
                  return next;
                });
              }}
            />
            <WriteHint id="travellers-fill-hint" hint={access.hint} />
          </>
        )}
        <RefusalAlert error={problem ?? saveTravellers.error} />
      </div>
    </ResponsiveDialog>
  );
}
