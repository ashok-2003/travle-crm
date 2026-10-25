"use client";

// The automatic answers on /settings/whatsapp (sales inbox spec 6), for the Owner and Admins: an away message sent outside
// the office's hours and days (once in 12 hours a chat), a welcome for a number writing for the first time, and keyword
// answers ("price" → the price list). Each is sent inside the window the customer just opened, and the chat still waits
// for a person's reply.
import type { InboxAutomation } from "@travel-crm/contracts/inbox";
import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ErrorState } from "@/components/error-state";
import { TimeField } from "@/components/forms/time-field";
import { LoadingRows } from "@/components/loading-rows";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useWriteAccess } from "@/subscription/write-access";
import { useAutomation, useAutomationChanges } from "./use-sales-inbox";

const days = ["1", "2", "3", "4", "5", "6", "0"] as const;
const asTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const asMinutes = (time: string) => {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

type Values = Omit<InboxAutomation, "openFrom" | "openUntil" | "openDays"> & {
  openFrom: string;
  openUntil: string;
  openDays: string[];
};

function AutomationForm({ saved }: { saved: InboxAutomation }) {
  const t = useTranslations("inbox.automation");
  const access = useWriteAccess("change");
  const { save } = useAutomationChanges();
  const form = useForm<Values>({
    defaultValues: {
      ...saved,
      openFrom: asTime(saved.openFrom),
      openUntil: asTime(saved.openUntil === 1440 ? 1439 : saved.openUntil),
      openDays: saved.openDays.map(String),
    },
  });
  const awayOn = useWatch({ control: form.control, name: "awayEnabled" });
  const welcomeOn = useWatch({ control: form.control, name: "welcomeEnabled" });
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        void form.handleSubmit((values) => {
          save.mutate(
            {
              ...values,
              openFrom: asMinutes(values.openFrom),
              openUntil: asMinutes(values.openUntil),
              openDays: values.openDays.map(Number),
            },
            { onSuccess: () => toast.success(t("saved")) },
          );
        })(event);
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>{t("awayTitle")}</CardTitle>
          <CardDescription>{t("awayIntro")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Controller
            control={form.control}
            name="awayEnabled"
            render={({ field }) => (
              <div className="flex items-center gap-3">
                <Switch id="away-on" checked={field.value} onCheckedChange={field.onChange} />
                <Label htmlFor="away-on">{t("awayOn")}</Label>
              </div>
            )}
          />
          <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
            <TimeField control={form.control} name="openFrom" label={t("opens")} />
            <TimeField control={form.control} name="openUntil" label={t("closes")} />
          </div>
          <Controller
            control={form.control}
            name="openDays"
            render={({ field }) => (
              <div className="flex flex-col gap-2">
                <Label>{t("openDays")}</Label>
                <ToggleGroup
                  type="multiple"
                  variant="outline"
                  spacing={1}
                  className="flex-wrap"
                  value={field.value}
                  onValueChange={field.onChange}
                  aria-label={t("openDays")}
                >
                  {days.map((day) => (
                    <ToggleGroupItem key={day} value={day} className="rounded-full">
                      {t(`days.${day}`)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            )}
          />
          <div className="flex flex-col gap-2">
            <Label htmlFor="away-message">{t("awayMessage")}</Label>
            <Textarea
              id="away-message"
              maxLength={1000}
              placeholder={t("awayPlaceholder")}
              disabled={!awayOn}
              {...form.register("awayMessage")}
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("welcomeTitle")}</CardTitle>
          <CardDescription>{t("welcomeIntro")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Controller
            control={form.control}
            name="welcomeEnabled"
            render={({ field }) => (
              <div className="flex items-center gap-3">
                <Switch id="welcome-on" checked={field.value} onCheckedChange={field.onChange} />
                <Label htmlFor="welcome-on">{t("welcomeOn")}</Label>
              </div>
            )}
          />
          <div className="flex flex-col gap-2">
            <Label htmlFor="welcome-message">{t("welcomeMessage")}</Label>
            <Textarea
              id="welcome-message"
              maxLength={1000}
              placeholder={t("welcomePlaceholder")}
              disabled={!welcomeOn}
              {...form.register("welcomeMessage")}
            />
          </div>
        </CardContent>
      </Card>
      <RefusalAlert error={save.error} />
      <Button type="submit" className="self-start" disabled={!access.allowed || save.isPending}>
        {t("save")}
      </Button>
    </form>
  );
}

function KeywordAnswers() {
  const t = useTranslations("inbox.automation");
  const access = useWriteAccess("change");
  const { keywords } = useAutomation(true);
  const { addKeyword, removeKeyword } = useAutomationChanges();
  const [keyword, setKeyword] = useState("");
  const [reply, setReply] = useState("");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("keywordsTitle")}</CardTitle>
        <CardDescription>{t("keywordsIntro")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {keywords.data !== undefined && keywords.data.length > 0 && (
          <ItemGroup>
            {keywords.data.map((item) => (
              <Item key={item.id} variant="muted" size="sm">
                <ItemContent className="min-w-0">
                  <ItemTitle className="numbers">{item.keyword}</ItemTitle>
                  <ItemDescription className="line-clamp-2" dir="auto">
                    {item.reply}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("removeKeyword", { keyword: item.keyword })}
                    disabled={!access.allowed || removeKeyword.isPending}
                    onClick={() => {
                      removeKeyword.mutate({ keywordReplyId: item.id });
                    }}
                  >
                    <XIcon aria-hidden="true" />
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (keyword.trim().length < 2 || reply.trim() === "") return;
            addKeyword.mutate(
              { keyword: keyword.trim().toLowerCase(), reply: reply.trim() },
              {
                onSuccess: () => {
                  setKeyword("");
                  setReply("");
                },
              },
            );
          }}
        >
          <div className="flex flex-col gap-2 sm:max-w-xs">
            <Label htmlFor="keyword-word">{t("keyword")}</Label>
            <Input
              id="keyword-word"
              maxLength={40}
              placeholder={t("keywordPlaceholder")}
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value);
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="keyword-reply">{t("keywordReply")}</Label>
            <Textarea
              id="keyword-reply"
              maxLength={1000}
              value={reply}
              onChange={(event) => {
                setReply(event.target.value);
              }}
            />
          </div>
          <RefusalAlert error={addKeyword.error} />
          <Button
            type="submit"
            variant="outline"
            className="self-start"
            disabled={!access.allowed || addKeyword.isPending}
          >
            {t("addKeyword")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function AutomationSection() {
  const t = useTranslations("inbox.automation");
  const { settings } = useAutomation(true);
  return (
    <section aria-labelledby="automation-heading" className="flex flex-col gap-4">
      <h2 id="automation-heading" className="text-section font-semibold">
        {t("title")}
      </h2>
      <p className="max-w-[65ch] text-muted-foreground">{t("intro")}</p>
      {settings.data === undefined ? (
        settings.isError ? (
          <ErrorState
            message={t("loadFailed")}
            error={settings.error}
            retryLabel={t("retry")}
            onRetry={() => void settings.refetch()}
          />
        ) : (
          <LoadingRows shape="twoLines" label={t("loading")} />
        )
      ) : (
        <AutomationForm saved={settings.data} />
      )}
      <KeywordAnswers />
    </section>
  );
}
