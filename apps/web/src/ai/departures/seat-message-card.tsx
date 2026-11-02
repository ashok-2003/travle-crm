"use client";

// One person's message about the departure's empty seats (release ai3): the words the AI wrote, for the staff member to edit,
// then "Open in WhatsApp" (their own WhatsApp, in a new tab, with the words ready to send) and, once sent, "Mark as sent", which
// notes it on the lead and leaves the person alone for 14 days. The product sends nothing itself, and nothing goes in bulk.
import type { InterestedPerson } from "@travel-crm/contracts/ai";
import { MessageCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { RefusalAlert } from "@/components/refusal-alert";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { formatPhoneNumber } from "@/lib/format";
import { WriteHint } from "@/subscription/write-hint";
import { useWriteAccess } from "@/subscription/write-access";
import { useMarkOfferSent } from "./use-ai-departures";
import type { SeatMessageState } from "./use-seat-messages";

/** wa.me opens the person's chat in the staff member's own WhatsApp with the words ready to send. */
export const whatsAppLink = (phone: string, text: string): string =>
  `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;

export function SeatMessageCard({
  departureId,
  person,
  state,
  onEdit,
  onAgain,
}: {
  departureId: string;
  person: InterestedPerson;
  state: SeatMessageState | undefined;
  onEdit: (text: string) => void;
  onAgain: () => void;
}) {
  const t = useTranslations("ai.departures.seats.message");
  const access = useWriteAccess("change");
  const mark = useMarkOfferSent();
  const [opened, setOpened] = useState(false);
  const [sent, setSent] = useState(false);
  const id = `seat-message-${person.leadId}`;
  const ready = state?.status === "ready" ? state : null;
  return (
    <Item size="sm" role="listitem" className="items-start">
      <ItemContent className="min-w-0">
        <ItemTitle>
          {person.name} {sent && <StatusBadge tone="good">{t("sent")}</StatusBadge>}
        </ItemTitle>
        <ItemDescription>{formatPhoneNumber(person.phone)}</ItemDescription>
        {state === undefined || state.status === "writing" ? (
          <p role="status" className="flex items-center gap-2 text-muted-foreground">
            <Spinner />
            {t("writing", { name: person.name })}
          </p>
        ) : state.status === "failed" ? (
          <>
            <RefusalAlert error={state.error} />
            <div>
              <Button variant="outline" onClick={onAgain}>
                {t("tryAgain")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <Field>
              <FieldLabel htmlFor={id}>{t("label", { name: person.name })}</FieldLabel>
              <Textarea
                id={id}
                rows={6}
                value={state.text}
                readOnly={sent}
                onChange={(event) => {
                  onEdit(event.target.value);
                }}
              />
              <FieldDescription>{sent ? t("sentHint") : t("hint")}</FieldDescription>
            </Field>
            {!sent && (
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild variant="outline">
                  <a
                    href={whatsAppLink(person.phone, state.text.trim())}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t("openNamed", { name: person.name })}
                    onClick={() => {
                      setOpened(true);
                    }}
                  >
                    <MessageCircleIcon aria-hidden="true" />
                    {t("open")}
                  </a>
                </Button>
                <Button
                  disabled={!opened || mark.isPending || !access.allowed || ready === null || state.text.trim() === ""}
                  aria-label={t("markNamed", { name: person.name })}
                  aria-describedby={`${id}-hint`}
                  onClick={() => {
                    mark.mutate(
                      { departureId, leadId: person.leadId, fillId: state.fillId, text: state.text.trim() },
                      {
                        onSuccess: () => {
                          setSent(true);
                          toast.success(t("marked", { name: person.name }));
                        },
                      },
                    );
                  }}
                >
                  {mark.isPending && <Spinner />}
                  {t("mark")}
                </Button>
                <WriteHint id={`${id}-hint`} hint={access.hint} />
                {!opened && <span className="text-caption text-muted-foreground">{t("openFirst")}</span>}
              </div>
            )}
            <RefusalAlert error={mark.error} />
          </>
        )}
      </ItemContent>
    </Item>
  );
}
