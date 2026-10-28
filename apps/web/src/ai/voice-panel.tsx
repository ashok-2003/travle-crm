"use client";

// "Talk like a real person" (the owner, 2026-10-28): a WhatsApp chat export (.txt) is read here in the browser, the
// person to copy is chosen from those who wrote in it, and the chat's latest lines go to the AI, which writes down how
// they talk and, for one chat, what the two talked about. For the agency (every chat) or one chat, where it wins over the agency's. Shows whose way of talking is
// in use, how they talk as the AI read it, and removes it.
import type { AiVoice } from "@travel-crm/contracts/ai";
import { MessageCircleHeartIcon, UploadIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ChoiceGroup } from "@/components/forms/choice-field";
import { RefusalAlert } from "@/components/refusal-alert";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { useWriteAccess } from "@/subscription/write-access";
import { useClearVoice, useLearnVoice } from "./use-ai";
import { conversationOf, readWhatsAppExport, sendersOf, type ExportedMessage } from "./whatsapp-export";

/** Fewer of someone's messages than this show too little of how they talk. */
const FEWEST = 5;

export function VoicePanel({
  conversationId,
  voice,
  inherited = false,
  disabled = false,
  context = null,
  remembered = 0,
}: {
  /** The chat it is for; null for the agency's. */
  conversationId: string | null;
  voice: AiVoice | null;
  /** The voice shown is the agency's, used in this chat. */
  inherited?: boolean;
  /** What this chat's export says the two talked about before. */
  context?: string | null;
  /** How many of the imported chat's messages it reads with every reply. */
  remembered?: number;
  disabled?: boolean;
}) {
  const t = useTranslations("ai.voice");
  const access = useWriteAccess("change");
  const learn = useLearnVoice(conversationId);
  const clear = useClearVoice(conversationId);
  const picker = useRef<HTMLInputElement>(null);
  const uploadButton = useRef<HTMLButtonElement>(null);
  const [messages, setMessages] = useState<ExportedMessage[] | null>(null);
  const [chosen, setChosen] = useState("");
  const off = disabled || !access.allowed;
  const senders = messages === null ? [] : sendersOf(messages);

  const read = async (file: File) => {
    const all = readWhatsAppExport(await file.text());
    const people = sendersOf(all);
    if (people.length === 0) {
      toast.error(t("notAnExport"));
      return;
    }
    setMessages(all);
    setChosen(people[0]?.name ?? "");
  };
  const close = () => {
    setMessages(null);
  };

  return (
    <div className="flex flex-col gap-3">
      {voice !== null && (
        <Item variant="muted">
          <ItemMedia variant="icon">
            <MessageCircleHeartIcon aria-hidden="true" className="text-primary" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>
              {inherited ? t("inherited", { name: voice.name }) : t("talkingLike", { name: voice.name })}
            </ItemTitle>
            <ItemDescription>{t("examples", { count: voice.examples })}</ItemDescription>
            {remembered > 0 && <ItemDescription>{t("remembered", { count: remembered })}</ItemDescription>}
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="link" className="h-auto p-0">
                  {t("howTheyTalk", { name: voice.name })}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <p className="pt-2 text-caption whitespace-pre-line text-muted-foreground">{voice.profile}</p>
              </CollapsibleContent>
            </Collapsible>
            {context !== null && context !== "" && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="link" className="h-auto p-0">
                    {t("context")}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <p className="pt-2 text-caption whitespace-pre-line text-muted-foreground">{context}</p>
                </CollapsibleContent>
              </Collapsible>
            )}
          </ItemContent>
          {!inherited && (
            <ItemActions>
              <Button variant="outline" size="sm" disabled={off || clear.isPending} onClick={clear.clear}>
                {clear.isPending && <Spinner aria-hidden="true" />}
                {t("remove")}
              </Button>
            </ItemActions>
          )}
        </Item>
      )}
      <input
        ref={picker}
        type="file"
        accept=".txt,text/plain"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file !== undefined) void read(file);
        }}
      />
      <Button
        ref={uploadButton}
        variant="outline"
        className="self-start"
        disabled={off}
        onClick={() => picker.current?.click()}
      >
        <UploadIcon aria-hidden="true" />
        {voice === null || inherited ? t("upload") : t("replace")}
      </Button>
      <p className="text-caption text-muted-foreground">{t("how")}</p>
      <RefusalAlert error={clear.error} />
      <ResponsiveDialog
        open={messages !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        busy={learn.isPending}
        returnFocusTo={uploadButton}
        title={t("dialogTitle")}
        description={t("dialogDescription", { count: messages?.length ?? 0 })}
        footer={
          <Button
            disabled={learn.isPending || (senders.find((one) => one.name === chosen)?.count ?? 0) < FEWEST}
            onClick={() => {
              if (messages === null) return;
              learn.learn({ personName: chosen, messages: conversationOf(messages, chosen) }, () => {
                toast.success(t("learned", { name: chosen }));
                close();
              });
            }}
          >
            {learn.isPending && <Spinner aria-hidden="true" />}
            {learn.isPending ? t("learning") : t("learn", { name: chosen })}
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <ChoiceGroup
            legend={t("whose")}
            value={chosen}
            onChange={setChosen}
            options={senders.slice(0, 8).map((sender) => ({
              value: sender.name,
              label: sender.name,
              description: sender.count < FEWEST ? t("tooFew") : t("messageCount", { count: sender.count }),
            }))}
          />
          <RefusalAlert error={learn.error} />
        </div>
      </ResponsiveDialog>
    </div>
  );
}
