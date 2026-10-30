"use client";

// "Write for the customer" (release ai2b): the AI writes a message about the quote, in English or Hindi, for WhatsApp or email.
// The total and the advance are the quote's own, put in by code; the person edits the words, then copies them or puts them in
// the customer's chat box (the inbox's own send does the sending, so nothing leaves from here).
import type { WriteUp, WriteUpInput } from "@travel-crm/contracts/ai";
import { writeUpChannels, writeUpLanguages } from "@travel-crm/contracts/ai";
import type { QuoteDetail } from "@travel-crm/contracts/quotes";
import { InfoIcon, MessageSquareTextIcon, SparklesIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { RefusalAlert } from "@/components/refusal-alert";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { inboxRoute } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { useSuggestReplyAvailable } from "../use-ai";
import { keepAiDraft } from "./chat-box";
import { useWriteUp } from "./use-write-up";

type Language = WriteUpInput["language"];
type Channel = WriteUpInput["channel"];
const isLanguage = (value: string): value is Language => writeUpLanguages.some((one) => one === value);
const isChannel = (value: string): value is Channel => writeUpChannels.some((one) => one === value);

export function WriteUpButton({
  quote,
  shareLink,
}: {
  quote: QuoteDetail;
  /** The customer's link for the quote, made once and kept by the quote screen. */
  shareLink: (then: (url: string) => void) => void;
}) {
  const t = useTranslations("ai.writeUp");
  const router = useRouter();
  const aiOn = useSuggestReplyAvailable();
  const mayView = useHolds("quotes:view");
  const available = aiOn && mayView;
  const writer = useWriteUp();
  const opener = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<Language>("en");
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [draft, setDraft] = useState<WriteUp | null>(null);
  const [text, setText] = useState("");
  if (!available) return null;

  const stale = draft !== null && draft.quoteUpdatedAt !== quote.updatedAt;
  const noDays = quote.days.length === 0;
  const write = () => {
    writer.mutate(
      { quoteId: quote.id, language, channel },
      {
        onSuccess: (written) => {
          setDraft(written);
          setText(written.text);
          // The quote's link goes where the model was told to put it: made now, as "Make link" would.
          if (written.text.includes("{link}")) {
            shareLink((url) => {
              setText((now) => now.replaceAll("{link}", url));
            });
          }
        },
      },
    );
  };
  const changeOpen = (next: boolean) => {
    if (!next) {
      setDraft(null);
      setText("");
      writer.reset();
    }
    setOpen(next);
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
        busy={writer.isPending}
        returnFocusTo={opener}
        title={t("title")}
        description={draft === null ? t("description") : t("reviewDescription")}
        footer={
          draft === null ? (
            <Button disabled={writer.isPending || noDays} onClick={write}>
              {writer.isPending && <Spinner />}
              {writer.isPending ? t("writing") : t("write")}
            </Button>
          ) : (
            <>
              <Button variant="outline" disabled={writer.isPending} onClick={write}>
                {writer.isPending && <Spinner />}
                {t("writeAgain")}
              </Button>
              <CopyButton value={text} label={t("copy")} />
              {draft.chat !== null && channel === "whatsapp" && (
                <Button
                  disabled={text.trim() === "" || stale}
                  onClick={() => {
                    if (draft.chat === null) return;
                    keepAiDraft(draft.chat.conversationId, { id: draft.chat.draftId, text: text.trim() });
                    router.push(inboxRoute(draft.chat.conversationId));
                  }}
                >
                  <MessageSquareTextIcon aria-hidden="true" />
                  {t("putInChat")}
                </Button>
              )}
            </>
          )
        }
      >
        <div className="flex flex-col gap-4">
          {noDays && (
            <Alert>
              <InfoIcon aria-hidden="true" />
              <AlertDescription>{t("noDays")}</AlertDescription>
            </Alert>
          )}
          {draft === null ? (
            <>
              <Field>
                <FieldLabel id="write-up-language">{t("language")}</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  aria-labelledby="write-up-language"
                  value={language}
                  onValueChange={(chosen) => {
                    if (isLanguage(chosen)) setLanguage(chosen);
                  }}
                >
                  {writeUpLanguages.map((one) => (
                    <ToggleGroupItem key={one} value={one} className="min-h-11 px-4">
                      {t(`languages.${one}`)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>
              <Field>
                <FieldLabel id="write-up-channel">{t("channel")}</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  aria-labelledby="write-up-channel"
                  value={channel}
                  onValueChange={(chosen) => {
                    if (isChannel(chosen)) setChannel(chosen);
                  }}
                >
                  {writeUpChannels.map((one) => (
                    <ToggleGroupItem key={one} value={one} className="min-h-11 px-4">
                      {t(`channels.${one}`)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <FieldDescription>{t("channelHint")}</FieldDescription>
              </Field>
            </>
          ) : (
            <>
              {stale && (
                <Alert>
                  <InfoIcon aria-hidden="true" />
                  <AlertDescription>{t("stale")}</AlertDescription>
                </Alert>
              )}
              {draft.removedAmounts && (
                <Alert>
                  <InfoIcon aria-hidden="true" />
                  <AlertDescription>{t("removedAmounts")}</AlertDescription>
                </Alert>
              )}
              <Field>
                <FieldLabel htmlFor="write-up-text">{t("textLabel")}</FieldLabel>
                <Textarea
                  id="write-up-text"
                  rows={14}
                  value={text}
                  onChange={(event) => {
                    setText(event.target.value);
                  }}
                />
                <FieldDescription>
                  {t("textHint", { used: draft.usedThisMonth, limit: draft.monthlyLimit })}
                </FieldDescription>
              </Field>
              {draft.chat === null && channel === "whatsapp" && <p className="text-muted-foreground">{t("noChat")}</p>}
            </>
          )}
          <RefusalAlert error={writer.error} />
        </div>
      </ResponsiveDialog>
    </>
  );
}
