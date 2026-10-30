"use client";

// Settings, AI: the autopilot. The AI answering WhatsApp chats by itself is OFF until an Owner or Admin turns it on here, and
// it needs the AI switched on above. What it does, what it never does and how it is kept in check (every message marked as the
// AI's and audited, STOP and the 24-hour window obeyed, the shared monthly limit) are said in plain words next to the switch;
// its notes, media, payment details and strict rules are saved with it.
import type { AutopilotSettings } from "@travel-crm/contracts/ai";
import { aiEmojiLevels, aiHandoffPolicies, aiLanguages, aiPersonas, aiStyles, aiTones } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { InfoHint } from "@/components/info-hint";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useWriteAccess } from "@/subscription/write-access";
import { PaymentsCard } from "./payments-card";
import { useSaveAutopilot } from "./use-ai";

type Draft = Omit<AutopilotSettings, "learnedAt" | "voice">;

function Choice<Value extends string>({
  label,
  value,
  values,
  words,
  disabled,
  onChange,
}: {
  label: string;
  value: Value;
  values: readonly Value[];
  words: (value: Value) => string;
  disabled: boolean;
  onChange: (value: Value) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          const chosen = values.find((one) => one === next);
          if (chosen !== undefined) onChange(chosen);
        }}
      >
        <SelectTrigger className="h-auto w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {values.map((one) => (
            <SelectItem key={one} value={one}>
              {words(one)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function AutopilotSection({ saved, aiOn }: { saved: AutopilotSettings; aiOn: boolean }) {
  const t = useTranslations("ai.autopilot");
  const access = useWriteAccess("change");
  const save = useSaveAutopilot();
  const [draft, setDraft] = useState<Draft>({
    autopilot: saved.autopilot,
    agentName: saved.agentName,
    followUpHours: saved.followUpHours,
    maxRepliesPerDay: saved.maxRepliesPerDay,
    language: saved.language,
    languageOther: saved.languageOther,
    style: saved.style,
    emojis: saved.emojis,
    tone: saved.tone,
    handoff: saved.handoff,
    smartFollowUp: saved.smartFollowUp,
    learning: saved.learning,
    persona: saved.persona,
    leadNotes: saved.leadNotes,
    sendMedia: saved.sendMedia,
    followUpTasks: saved.followUpTasks,
    paymentDetails: saved.paymentDetails,
    strictRules: saved.strictRules,
  });
  const set = <Key extends keyof Draft>(key: Key, value: Draft[Key]) => {
    setDraft((now) => ({ ...now, [key]: value }));
  };
  const busy = save.isPending || !access.allowed;
  const changed = (Object.keys(draft) as (keyof Draft)[]).some((key) => draft[key] !== saved[key]);
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(
          {
            ...draft,
            agentName: draft.agentName.trim(),
            languageOther: draft.languageOther.trim(),
            paymentDetails: draft.paymentDetails.trim(),
            strictRules: draft.strictRules.trim(),
          },
          { onSuccess: () => toast.success(t("saved")) },
        );
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <h2>{t("title")}</h2>
            <InfoHint term={t("title")}>{t("info")}</InfoHint>
          </CardTitle>
          <CardDescription>{t("intro")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Switch
              id="ai-autopilot"
              checked={draft.autopilot}
              disabled={busy || !aiOn}
              onCheckedChange={(on) => {
                set("autopilot", on);
              }}
            />
            <Label htmlFor="ai-autopilot">{t("on")}</Label>
          </div>
          {!aiOn && <p className="text-muted-foreground">{t("needsAi")}</p>}
          <p className="text-label text-muted-foreground">{t("rules")}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("speakTitle")}</h2>
          </CardTitle>
          <CardDescription>{t("speakIntro")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="ai-agent-name">{t("agentName")}</Label>
            <Input
              id="ai-agent-name"
              value={draft.agentName}
              maxLength={80}
              disabled={busy}
              placeholder={t("agentNamePlaceholder")}
              onChange={(event) => {
                set("agentName", event.target.value);
              }}
            />
          </div>
          <Choice
            label={t("language")}
            value={draft.language}
            values={aiLanguages}
            words={(one) => t(`languages.${one}`)}
            disabled={busy}
            onChange={(value) => {
              set("language", value);
            }}
          />
          {draft.language === "other" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ai-language-other">{t("languageOther")}</Label>
              <Input
                id="ai-language-other"
                value={draft.languageOther}
                maxLength={40}
                disabled={busy}
                onChange={(event) => {
                  set("languageOther", event.target.value);
                }}
              />
            </div>
          )}
          <Choice
            label={t("style")}
            value={draft.style}
            values={aiStyles}
            words={(one) => t(`styles.${one}`)}
            disabled={busy}
            onChange={(value) => {
              set("style", value);
            }}
          />
          <Choice
            label={t("emojis")}
            value={draft.emojis}
            values={aiEmojiLevels}
            words={(one) => t(`emojiLevels.${one}`)}
            disabled={busy}
            onChange={(value) => {
              set("emojis", value);
            }}
          />
          <Choice
            label={t("tone")}
            value={draft.tone}
            values={aiTones}
            words={(one) => t(`tones.${one}`)}
            disabled={busy}
            onChange={(value) => {
              set("tone", value);
            }}
          />
          <Choice
            label={t("persona")}
            value={draft.persona}
            values={aiPersonas}
            words={(one) => t(`personas.${one}`)}
            disabled={busy}
            onChange={(value) => {
              set("persona", value);
            }}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("sellTitle")}</h2>
          </CardTitle>
          <CardDescription>{t("sellIntro")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Choice
            label={t("handoff")}
            value={draft.handoff}
            values={aiHandoffPolicies}
            words={(one) => t(`handoffs.${one}`)}
            disabled={busy}
            onChange={(value) => {
              set("handoff", value);
            }}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ai-max-replies">{t("maxReplies")}</Label>
            <Input
              id="ai-max-replies"
              type="number"
              inputMode="numeric"
              min={1}
              max={200}
              value={draft.maxRepliesPerDay}
              disabled={busy}
              onChange={(event) => {
                set("maxRepliesPerDay", Math.min(200, Math.max(1, Math.round(Number(event.target.value) || 1))));
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ai-follow-up-hours">{t("followUpHours")}</Label>
            <Input
              id="ai-follow-up-hours"
              type="number"
              inputMode="numeric"
              min={0}
              max={20}
              value={draft.followUpHours}
              disabled={busy}
              onChange={(event) => {
                set("followUpHours", Math.min(23, Math.max(0, Math.round(Number(event.target.value) || 0))));
              }}
            />
            <p className="text-label text-muted-foreground">{t("followUpHint")}</p>
          </div>
          <div className="flex items-start gap-3 self-end">
            <Switch
              id="ai-smart-follow-up"
              checked={draft.smartFollowUp}
              disabled={busy}
              onCheckedChange={(on) => {
                set("smartFollowUp", on);
              }}
            />
            <Label htmlFor="ai-smart-follow-up">{t("smartFollowUp")}</Label>
          </div>
          <div className="flex items-start gap-3 sm:col-span-2">
            <Switch
              id="ai-learning"
              checked={draft.learning}
              disabled={busy}
              onCheckedChange={(on) => {
                set("learning", on);
              }}
            />
            <div className="flex flex-col gap-1">
              <Label htmlFor="ai-learning">{t("learning")}</Label>
              <p className="text-label text-muted-foreground">{t("learningHint")}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <PaymentsCard
        values={draft}
        change={(patch) => {
          setDraft((now) => ({ ...now, ...patch }));
        }}
        disabled={busy}
      />
      <RefusalAlert error={save.error} />
      <Button type="submit" className="self-start" disabled={busy || !changed}>
        {save.isPending && <Spinner aria-hidden="true" />}
        {save.isPending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
