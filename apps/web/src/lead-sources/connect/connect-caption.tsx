// The caption under a connect screen's title (spec 6.5): "Step 2 of 3 · Match columns".
import { useTranslations } from "next-intl";
import { stepNumbers } from "./use-connect-sheet";

export function ConnectCaption({ step }: { step: keyof typeof stepNumbers }) {
  const t = useTranslations("sheets.connect");
  return (
    <p className="text-label text-muted-foreground">
      {t("caption", { step: stepNumbers[step], name: t(`steps.${step}`) })}
    </p>
  );
}
