"use client";

// Messages on a lead's page (release 5, scope 3.5): the agency's one message library with this customer's details filled
// into the blanks. Choose a message, see how it will read (a blank with nothing to fill is highlighted, for the person to
// type), then Copy it or Open it in WhatsApp. The quote's link is made when the message is copied or opened, not before.
// It needs only leads:view and works without the WhatsApp module; opening WhatsApp needs inbox:reply.
import { useMutation, useQuery } from "@tanstack/react-query";
import { MessageSquareTextIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { ChoiceGroup } from "@/components/forms/choice-field";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { RefusalAlert } from "@/components/refusal-alert";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/data/trpc";
import { useHolds } from "@/session/me-context";
import { whatsAppLink } from "../contact-buttons";

const BLANK = /(\{[a-z]+\})/;

/** The text with each blank still in it marked, so the person sees what they must type. */
function Highlighted({ text }: { text: string }) {
  return (
    <p className="break-words whitespace-pre-line script-leading">
      {text.split(BLANK).map((part, index) =>
        BLANK.test(part) ? (
          <span key={`${String(index)}-${part}`} className="bg-status-attention-fill text-status-attention-ink">
            {part}
          </span>
        ) : (
          <Fragment key={`${String(index)}-text`}>{part}</Fragment>
        ),
      )}
    </p>
  );
}

export function MessagesButton({ leadId, name, phone }: { leadId: string; name: string; phone: string | null }) {
  const t = useTranslations("leads.lead.messages");
  const trpc = useTRPC();
  const canReply = useHolds("inbox:reply");
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState("");
  const opener = useRef<HTMLButtonElement>(null);
  const library = useQuery({ ...trpc.leads.messageLibrary.queryOptions(), enabled: open });
  const message = library.data?.find((candidate) => candidate.id === chosen);
  const preview = useQuery({
    ...trpc.leads.messagePreview.queryOptions({ leadId, text: message?.body ?? "" }),
    enabled: open && message !== undefined,
  });
  // Nothing is copied or opened while a blank has no value for this lead (no quote yet): a message is never sent with one.
  const stillOpen = preview.data?.open ?? [];
  const blocked = message !== undefined && (preview.data === undefined || stillOpen.length > 0);
  const blockedId = useId();
  const ready = useMutation(trpc.leads.readyMessage.mutationOptions());
  const use = (how: "copy" | "whatsapp") => {
    if (message === undefined) return;
    ready.mutate(
      { leadId, text: message.body },
      {
        onSuccess: ({ text }) => {
          if (how === "copy") {
            void navigator.clipboard.writeText(text).then(
              () => {
                toast.success(t("copied"));
              },
              () => {
                toast.error(t("copyFailed"));
              },
            );
          } else if (phone !== null) {
            window.open(`${whatsAppLink(phone)}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
          }
        },
      },
    );
  };

  const body = () => {
    if (library.data === undefined) {
      return library.isError ? (
        <LoadFailedAlert message={t("loadFailed")} error={library.error} onRetry={() => void library.refetch()} />
      ) : (
        <LoadingRows rows={3} shape="twoLines" label={t("loading")} />
      );
    }
    if (library.data.length === 0) return <p className="text-muted-foreground">{t("empty")}</p>;
    return (
      <div className="flex flex-col gap-4">
        <ChoiceGroup
          legend={t("choose")}
          value={chosen}
          onChange={setChosen}
          options={library.data.map((reply) => ({ value: reply.id, label: reply.title }))}
        />
        {message !== undefined && (
          <section aria-label={t("preview")} className="flex flex-col gap-2">
            <h3 className="font-medium">{t("preview")}</h3>
            {preview.data === undefined ? (
              preview.isError ? (
                <RefusalAlert error={preview.error} />
              ) : (
                <LoadingRows rows={2} label={t("previewLoading")} />
              )
            ) : (
              <>
                <Highlighted text={preview.data.text} />
                {message.body.includes("{link}") && <p className="text-label text-muted-foreground">{t("linkNote")}</p>}
              </>
            )}
          </section>
        )}
        <RefusalAlert error={ready.error} />
      </div>
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
        <MessageSquareTextIcon aria-hidden="true" />
        {t("button")}
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        busy={ready.isPending}
        returnFocusTo={opener}
        title={t("title")}
        description={t("description", { name })}
        footer={
          <>
            {blocked && stillOpen.length > 0 && (
              <p id={blockedId} className="text-label text-muted-foreground">
                {t("blocked", { blanks: stillOpen.map((blank) => `{${blank}}`).join(", ") })}
              </p>
            )}
            {canReply && phone !== null && (
              <Button
                variant="outline"
                aria-describedby={blocked && stillOpen.length > 0 ? blockedId : undefined}
                disabled={message === undefined || blocked || ready.isPending}
                onClick={() => {
                  use("whatsapp");
                }}
              >
                {t("whatsApp")}
              </Button>
            )}
            <Button
              aria-describedby={blocked && stillOpen.length > 0 ? blockedId : undefined}
              disabled={message === undefined || blocked || ready.isPending}
              onClick={() => {
                use("copy");
              }}
            >
              {t("copy")}
            </Button>
          </>
        }
      >
        {open && body()}
      </ResponsiveDialog>
    </>
  );
}
