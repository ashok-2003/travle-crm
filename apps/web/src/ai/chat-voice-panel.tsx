"use client";

// One chat's own way of talking (Ayush's per-chat voice and history, ported): an export of this chat is read here in the browser,
// the person to copy is chosen from those who wrote in it, and the chat's latest lines, BOTH sides, go to the AI, which writes
// down how they talk and what the two talked about; the chat keeps its last messages and reads them with every reply. It wins
// over the agency's way of talking in this chat. Shows whose way of talking is in use, and removes it.
import type { ChatAi } from "@travel-crm/contracts/ai";
import { MessageCircleHeartIcon, UploadIcon, UsersIcon } from "lucide-react";
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
import { useClearChatVoice, useLearnChatVoice } from "./use-ai";
import { conversationOf, readWhatsAppExport, sendersOf, type ExportedMessage } from "./whatsapp-export";

/** Fewer of someone's messages than this show too little of how they talk. */
const FEWEST = 5;

export function ChatVoicePanel({
  conversationId,
  voice,
  disabled = false,
}: {
  conversationId: string;
  voice: ChatAi["voice"];
  disabled?: boolean;
}) {
  const t = useTranslations("ai.voice");
  const access = useWriteAccess("change");
  const learn = useLearnChatVoice();
  const clear = useClearChatVoice();
  const picker = useRef<HTMLInputElement>(null);
  const uploadButton = useRef<HTMLButtonElement>(null);
  const [messages, setMessages] = useState<ExportedMessage[] | null>(null);
  const [chosen, setChosen] = useState("");
  const off = disabled || !access.allowed;
  const senders = messages === null ? [] : sendersOf(messages);
  const own = voice?.own === true;

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
      <h3 className="text-label font-medium text-muted-foreground">{t("chatTitle")}</h3>
      {voice !== null && (
        <Item variant="muted">
          <ItemMedia variant="icon">
            <MessageCircleHeartIcon aria-hidden="true" className="text-primary" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{own ? t("talkingLike", { name: voice.name }) : t("inherited", { name: voice.name })}</ItemTitle>
            {own && voice.history > 0 && <ItemDescription>{t("remembered", { count: voice.history })}</ItemDescription>}
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
            {voice.context !== null && voice.context !== "" && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="link" className="h-auto p-0">
                    {t("context")}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <p className="pt-2 text-caption whitespace-pre-line text-muted-foreground">{voice.context}</p>
                </CollapsibleContent>
              </Collapsible>
            )}
          </ItemContent>
          {own && (
            <ItemActions>
              <Button
                variant="outline"
                size="sm"
                disabled={off || clear.isPending}
                onClick={() => {
                  clear.mutate({ conversationId });
                }}
              >
                {clear.isPending && <Spinner aria-hidden="true" />}
                {t("chatRemove")}
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
        {own ? t("replace") : t("upload")}
      </Button>
      <p className="text-caption text-muted-foreground">{t("chatIntro")}</p>
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
              learn.mutate(
                { conversationId, personName: chosen, messages: conversationOf(messages, chosen) },
                {
                  onSuccess: () => {
                    toast.success(t("chatLearned", { name: chosen }));
                    close();
                  },
                },
              );
            }}
          >
            {learn.isPending && <Spinner aria-hidden="true" />}
            {learn.isPending ? t("chatLearning") : t("chatLearn", { name: chosen })}
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <Item variant="muted" size="sm">
            <ItemMedia variant="icon">
              <UsersIcon aria-hidden="true" className="text-primary" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{t("readsAll")}</ItemTitle>
              <ItemDescription className="line-clamp-none">
                {senders
                  .slice(0, 8)
                  .map((sender) => t("personCount", { name: sender.name, count: sender.count }))
                  .join(" · ")}
              </ItemDescription>
            </ItemContent>
          </Item>
          <ChoiceGroup
            legend={t("whose")}
            value={chosen}
            onChange={setChosen}
            options={senders.slice(0, 8).map((sender) => ({
              value: sender.name,
              label: sender.name,
              description:
                sender.count < FEWEST
                  ? t("tooFew")
                  : t("becomes", {
                      name: sender.name,
                      other: senders.find((one) => one.name !== sender.name)?.name ?? t("theOther"),
                    }),
            }))}
          />
          <RefusalAlert error={learn.error} />
        </div>
      </ResponsiveDialog>
    </div>
  );
}
