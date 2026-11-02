// What a public page shows when the api could not be reached (release 7b): one sentence and a way to try again. Server-rendered.
import { RotateCcwIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { MessagePage } from "@/components/message-page";
import { Button } from "@/components/ui/button";

export async function PageFailed({ href }: { href: string }) {
  const t = await getTranslations("packagePages.page");
  return (
    <MessagePage icon={RotateCcwIcon} title={t("failedTitle")} body={t("failed")}>
      <Button asChild>
        <a href={href}>{t("tryAgain")}</a>
      </Button>
    </MessagePage>
  );
}
