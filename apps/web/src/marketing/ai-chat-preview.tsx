// A sample WhatsApp chat the AI handles, for the public page: the customer's words on the left, the AI's replies (with
// an itinerary PDF and photos) on the right in the people violet (DESIGN.md: conversations), and what it did in the
// CRM between them. Sample words, not anyone's chat.
import { FileTextIcon, ImagesIcon, SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function Bubble({ from, label, children }: { from: "customer" | "ai"; label: string; children: ReactNode }) {
  const isAi = from === "ai";
  return (
    <div className={cn("flex max-w-[85%] flex-col gap-1", isAi ? "items-end self-end" : "items-start self-start")}>
      <span className="flex items-center gap-1 text-caption text-muted-foreground">
        {isAi && <SparklesIcon aria-hidden="true" className="size-3" />}
        {label}
      </span>
      <div
        className={cn(
          "flex flex-col gap-2 rounded-lg px-3 py-2",
          isAi ? "bg-people-tint text-people-tint-ink" : "bg-surface text-foreground",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function InTheCrm({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="self-center text-center text-caption text-muted-foreground">
      <span className="font-medium">{label}: </span>
      {children}
    </p>
  );
}

export function AiChatPreview() {
  const t = useTranslations("marketing.ai");
  return (
    <figure aria-label={t("graphic")}>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <Bubble from="customer" label={t("chat.customer")}>
            {t("chat.first")}
          </Bubble>
          <Bubble from="ai" label={t("chat.ai")}>
            <p>{t("chat.firstReply")}</p>
            <span className="flex items-center gap-2 font-medium">
              <FileTextIcon aria-hidden="true" className="size-4" />
              {t("chat.attachment")}
            </span>
            <span className="flex items-center gap-2 font-medium">
              <ImagesIcon aria-hidden="true" className="size-4" />
              {t("chat.photos")}
            </span>
          </Bubble>
          <InTheCrm label={t("chat.update")}>{t("chat.leadUpdated")}</InTheCrm>
          <Bubble from="customer" label={t("chat.customer")}>
            {t("chat.second")}
          </Bubble>
          <Bubble from="ai" label={t("chat.ai")}>
            {t("chat.secondReply")}
          </Bubble>
          <InTheCrm label={t("chat.update")}>{t("chat.followUp")}</InTheCrm>
        </CardContent>
      </Card>
    </figure>
  );
}
