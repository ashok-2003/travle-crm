"use client";

// Settings, AI: the way of talking the AI copies. An Owner or Admin picks a WhatsApp chat export (.txt, "Export chat", no
// media) and the staff member in it; the browser keeps ONLY that person's own messages and sends those: what the other side
// wrote never leaves this screen. The AI still tells anyone who sincerely asks that it is an AI.
import type { AutopilotSettings } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { RefusalAlert } from "@/components/refusal-alert";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useWriteAccess } from "@/subscription/write-access";
import { useClearVoice, useLearnVoice } from "./use-ai";
import { ownMessagesOf, readWhatsAppExport, sendersOf, type ExportedMessage } from "./whatsapp-export";

export function VoiceSection({ voice }: { voice: AutopilotSettings["voice"] }) {
  const t = useTranslations("ai.voice");
  const access = useWriteAccess("change");
  const learn = useLearnVoice();
  const clear = useClearVoice();
  const [messages, setMessages] = useState<ExportedMessage[] | null>(null);
  const [sender, setSender] = useState("");
  const [unreadable, setUnreadable] = useState(false);
  const senders = messages === null ? [] : sendersOf(messages);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("title")}</h2>
        </CardTitle>
        <CardDescription>{t("intro")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {voice !== null && (
          <Alert>
            <AlertDescription className="flex flex-col gap-2">
              <span>{t("current", { name: voice.name, count: voice.examples })}</span>
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                disabled={clear.isPending || !access.allowed}
                onClick={() => {
                  clear.mutate(undefined, { onSuccess: () => toast.success(t("removed")) });
                }}
              >
                {t("remove")}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ai-voice-file">{t("file")}</Label>
          <Input
            id="ai-voice-file"
            type="file"
            accept=".txt,text/plain"
            disabled={learn.isPending || !access.allowed}
            onChange={(event) => {
              const file = event.target.files?.[0];
              setUnreadable(false);
              setMessages(null);
              if (file === undefined) return;
              void file.text().then((text) => {
                const read = readWhatsAppExport(text);
                const first = sendersOf(read)[0];
                if (first === undefined) setUnreadable(true);
                setMessages(read);
                setSender(first?.name ?? "");
              });
            }}
          />
          <p className="text-label text-muted-foreground">{t("fileHint")}</p>
        </div>
        {unreadable && (
          <Alert variant="destructive">
            <AlertDescription>{t("unreadable")}</AlertDescription>
          </Alert>
        )}
        {messages !== null && senders.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <Label>{t("who")}</Label>
            <Select value={sender} onValueChange={setSender}>
              <SelectTrigger className="h-auto w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {senders.map((one) => (
                  <SelectItem key={one.name} value={one.name}>
                    {t("sender", { name: one.name, count: one.count })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-label text-muted-foreground">{t("whoHint")}</p>
          </div>
        )}
        <RefusalAlert error={learn.error ?? clear.error} />
        <Button
          className="self-start"
          disabled={messages === null || sender === "" || learn.isPending || !access.allowed}
          onClick={() => {
            if (messages === null) return;
            learn.mutate(
              { personName: sender, ownMessages: ownMessagesOf(messages, sender) },
              {
                onSuccess: () => {
                  toast.success(t("learned"));
                  setMessages(null);
                },
              },
            );
          }}
        >
          {learn.isPending && <Spinner aria-hidden="true" />}
          {learn.isPending ? t("learning") : t("learn")}
        </Button>
      </CardContent>
    </Card>
  );
}
