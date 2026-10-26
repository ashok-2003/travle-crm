"use client";

// The keyword answers on /settings/whatsapp (sales inbox spec 6): a customer's message holding a word ("price", "itinerary")
// is answered with the agency's words, at most once in a while per chat. Added and removed here; both are audited.
import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useWriteAccess } from "@/subscription/write-access";
import { useAutomation, useAutomationChanges } from "./use-sales-inbox";

export function KeywordAnswers() {
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
