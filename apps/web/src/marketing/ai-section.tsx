// The AI on WhatsApp (Release F): what it does, in five steps, beside a sample chat it handles. Coming soon, and said
// so. The chat is built from the app's pieces, so it stays sharp on any screen and needs no image.
import { useTranslations } from "next-intl";
import { FeatureStatus } from "./feature-status";
import { AiChatPreview } from "./ai-chat-preview";
import { MarketingSection } from "./section";

const steps = ["read", "reply", "send", "update", "handOver"] as const;

export function AiSection() {
  const t = useTranslations("marketing.ai");
  return (
    <MarketingSection id="ai" title={t("title")} intro={t("intro")}>
      <div className="grid items-start gap-10 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <FeatureStatus availability="soon" />
          <ol className="flex flex-col gap-5">
            {steps.map((step, index) => (
              <li key={step} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-people-tint font-mono text-label text-people-tint-ink tabular-nums"
                >
                  {index + 1}
                </span>
                <div className="flex flex-col gap-1">
                  <h3 className="font-semibold">{t(`steps.${step}.title`)}</h3>
                  <p className="text-muted-foreground">{t(`steps.${step}.detail`)}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="text-pretty">{t("control")}</p>
        </div>
        <AiChatPreview />
      </div>
    </MarketingSection>
  );
}
