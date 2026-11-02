"use client";

// "Find interested people" on a departure that is Open or Filling fast (release ai3): the people who asked about this place in the
// last year and may be offered its empty seats (a plain query: no blocked or opted-out person, nobody offered it in the last
// 14 days, only the viewer's own leads). Staff tick up to 20 and the AI writes a personal message for each; each is edited, then
// opened in the staff member's own WhatsApp and marked sent, one by one. The product sends nothing.
import { OFFER_MESSAGES_MAX, type InterestedPerson } from "@travel-crm/contracts/ai";
import { UsersIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldSet } from "@/components/ui/field";
import { ItemGroup } from "@/components/ui/item";
import { formatCalendarDay } from "@/lib/format";
import { SeatMessageCard } from "./seat-message-card";
import { useInterestedPeople } from "./use-ai-departures";
import { useSeatMessages } from "./use-seat-messages";
import { useSuggestReplyAvailable } from "../use-ai";

function Messages({ departureId, people }: { departureId: string; people: readonly InterestedPerson[] }) {
  const leadIds = useMemo(() => people.map((one) => one.leadId), [people]);
  const { messages, again, edit } = useSeatMessages(departureId, leadIds);
  return (
    <ItemGroup>
      {people.map((person) => (
        <SeatMessageCard
          key={person.leadId}
          departureId={departureId}
          person={person}
          state={messages[person.leadId]}
          onEdit={(text) => {
            edit(person.leadId, text);
          }}
          onAgain={() => {
            again(person.leadId);
          }}
        />
      ))}
    </ItemGroup>
  );
}

export function InterestedPeopleButton({ departureId }: { departureId: string }) {
  const t = useTranslations("ai.departures.seats");
  const tCommon = useTranslations("common");
  const aiOn = useSuggestReplyAvailable();
  const opener = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [writing, setWriting] = useState<readonly InterestedPerson[] | null>(null);
  const found = useInterestedPeople(departureId, open && writing === null);
  if (!aiOn) return null;

  const changeOpen = (next: boolean) => {
    if (!next) {
      setTicked(new Set());
      setWriting(null);
    }
    setOpen(next);
  };
  const people = found.data?.people ?? [];
  return (
    <>
      <Button
        ref={opener}
        variant="outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        <UsersIcon aria-hidden="true" />
        {t("button")}
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={changeOpen}
        returnFocusTo={opener}
        title={t("title")}
        description={writing === null ? t("description") : t("messagesDescription")}
        footer={
          writing === null ? (
            <Button
              disabled={ticked.size === 0}
              onClick={() => {
                setWriting(people.filter((one) => ticked.has(one.leadId)));
              }}
            >
              {t("write", { count: ticked.size })}
            </Button>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-4">
          {writing !== null ? (
            <Messages departureId={departureId} people={writing} />
          ) : found.data !== undefined ? (
            people.length === 0 ? (
              <p>{t("none")}</p>
            ) : (
              <>
                <p className="text-muted-foreground">
                  {t("choose", { max: OFFER_MESSAGES_MAX })} {found.data.more && t("more")}
                </p>
                <FieldSet>
                  {people.map((person) => {
                    const id = `interested-${person.leadId}`;
                    const on = ticked.has(person.leadId);
                    const details = [
                      person.destination === null ? "" : t("asked", { place: person.destination }),
                      person.travelling ?? "",
                      person.partySize === null ? "" : t("party", { count: person.partySize }),
                      t("enquired", { day: formatCalendarDay(person.enquiredOn) }),
                    ].filter((part) => part !== "");
                    return (
                      <Field key={person.leadId} orientation="horizontal" className="min-h-11">
                        <Checkbox
                          id={id}
                          checked={on}
                          disabled={!on && ticked.size >= OFFER_MESSAGES_MAX}
                          onCheckedChange={(next) => {
                            setTicked((before) => {
                              const after = new Set(before);
                              if (next === true) after.add(person.leadId);
                              else after.delete(person.leadId);
                              return after;
                            });
                          }}
                        />
                        <FieldContent>
                          <FieldLabel htmlFor={id} className="font-normal">
                            <span className="font-medium">{person.name}</span>
                            {person.label !== null && (
                              <span className="text-caption">{t(`labels.${person.label}`)}</span>
                            )}
                          </FieldLabel>
                          <FieldDescription>{details.join(" · ")}</FieldDescription>
                        </FieldContent>
                      </Field>
                    );
                  })}
                </FieldSet>
              </>
            )
          ) : found.isError ? (
            <ErrorState
              message={t("loadFailed")}
              error={found.error}
              retryLabel={tCommon("tryAgain")}
              onRetry={() => void found.refetch()}
            />
          ) : (
            <LoadingRows shape="twoLines" label={t("loading")} />
          )}
        </div>
      </ResponsiveDialog>
    </>
  );
}
