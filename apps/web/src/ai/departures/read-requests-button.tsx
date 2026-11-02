"use client";

// "Read requests" on a departure's Rooming tab (release ai3): the AI reads each traveller's room note, the notes on their
// booking's lead and what it kept from the chat, and proposes which of the fixed room requests each asked for, with the words
// it read that from. Staff tick and Apply: that is the rooming list's own update, audited as drafted by AI. Unknown stays
// unset. Rooms are still drafted by the plain code. One reading is one of the month's AI calls.
import type { RoomRequestsProposal } from "@travel-crm/contracts/ai";
import { SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { RefusalAlert } from "@/components/refusal-alert";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldSet } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useRoomingChanges } from "@/departures/use-departures";
import { WriteHint } from "@/subscription/write-hint";
import { useWriteAccess } from "@/subscription/write-access";
import { useSuggestReplyAvailable } from "../use-ai";
import { useReadRoomRequests } from "./use-ai-departures";

export function ReadRequestsButton({ departureId }: { departureId: string }) {
  const t = useTranslations("ai.departures.rooming");
  const requests = useTranslations("departures.rooming.requests");
  const aiOn = useSuggestReplyAvailable();
  const access = useWriteAccess("change");
  const reader = useReadRoomRequests();
  const { setRequests } = useRoomingChanges();
  const opener = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [proposal, setProposal] = useState<RoomRequestsProposal | null>(null);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  if (!aiOn) return null;

  const busy = reader.isPending || setRequests.isPending;
  const changeOpen = (next: boolean) => {
    if (!next) {
      setProposal(null);
      setTicked(new Set());
      reader.reset();
      setRequests.reset();
    }
    setOpen(next);
  };
  const read = () => {
    reader.mutate(
      { departureId },
      {
        onSuccess: (found) => {
          setProposal(found);
          setTicked(new Set(found.suggestions.map((one) => one.travellerId)));
        },
      },
    );
  };
  const apply = () => {
    const fillId = proposal?.fillId ?? null;
    if (proposal === null || fillId === null) return;
    const chosen = proposal.suggestions.filter((one) => ticked.has(one.travellerId));
    setRequests.mutate(
      {
        departureId,
        changes: chosen.map((one) => ({ travellerId: one.travellerId, roomRequest: one.proposed })),
        aiFill: { fillId },
      },
      {
        onSuccess: () => {
          toast.success(t("applied", { count: chosen.length }));
          changeOpen(false);
        },
      },
    );
  };

  return (
    <>
      <Button
        ref={opener}
        variant="outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        <SparklesIcon aria-hidden="true" />
        {t("button")}
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={changeOpen}
        busy={busy}
        returnFocusTo={opener}
        title={t("title")}
        description={proposal === null ? t("description") : t("reviewDescription")}
        footer={
          proposal === null ? (
            <Button disabled={busy} onClick={read}>
              {busy && <Spinner />}
              {busy ? t("reading") : t("read")}
            </Button>
          ) : (
            proposal.suggestions.length > 0 && (
              <>
                <Button
                  disabled={busy || ticked.size === 0 || !access.allowed}
                  aria-describedby="read-requests-hint"
                  onClick={apply}
                >
                  {setRequests.isPending && <Spinner />}
                  {t("apply", { count: ticked.size })}
                </Button>
                <WriteHint id="read-requests-hint" hint={access.hint} />
              </>
            )
          )
        }
      >
        <div className="flex flex-col gap-4">
          {proposal !== null &&
            (proposal.suggestions.length === 0 ? (
              <p>{t("nothing")}</p>
            ) : (
              <FieldSet>
                {proposal.suggestions.map((one) => {
                  const id = `room-request-${one.travellerId}`;
                  return (
                    <Field key={one.travellerId} orientation="horizontal" className="min-h-11">
                      <Checkbox
                        id={id}
                        checked={ticked.has(one.travellerId)}
                        onCheckedChange={(on) => {
                          setTicked((before) => {
                            const next = new Set(before);
                            if (on === true) next.add(one.travellerId);
                            else next.delete(one.travellerId);
                            return next;
                          });
                        }}
                      />
                      <FieldContent>
                        <FieldLabel htmlFor={id} className="font-normal">
                          <span className="font-medium">{one.name}</span>
                          <span className="text-people-tint-ink">{requests(one.proposed)}</span>
                        </FieldLabel>
                        <FieldDescription>
                          <span className="numbers">{one.bookingNumber}</span> · {t("from", { words: one.excerpt })}
                        </FieldDescription>
                      </FieldContent>
                    </Field>
                  );
                })}
              </FieldSet>
            ))}
          {proposal !== null && proposal.suggestions.length > 0 && (
            <p className="text-caption text-muted-foreground">
              {t("usage", { used: proposal.usedThisMonth, limit: proposal.monthlyLimit })}
            </p>
          )}
          <RefusalAlert error={reader.error ?? setRequests.error} />
        </div>
      </ResponsiveDialog>
    </>
  );
}
