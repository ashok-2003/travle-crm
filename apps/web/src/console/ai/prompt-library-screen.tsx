"use client";

// /console/ai-prompts: the lite WhatsApp agent's fixed prompt pieces and what each of its two model calls is given, a
// super admin's alone. Support is told so and the api is not asked, which would refuse.
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCalendarDay } from "@/lib/format";
import { useConsoleTRPC } from "../data/console-trpc";
import { isSuperAdmin, useStaff } from "../session/staff-context";
import { ModelCallCard } from "./model-call-card";
import { TraceText } from "./trace-text";

function PromptLibrary() {
  const t = useTranslations("consoleAi.prompts");
  const tCommon = useTranslations("common");
  const trpc = useConsoleTRPC();
  const library = useQuery(trpc.aiTransparency.prompts.queryOptions());
  if (library.data === undefined) {
    return library.isError ? (
      <ErrorState
        message={t("loadFailed")}
        error={library.error}
        retryLabel={tCommon("tryAgain")}
        onRetry={() => void library.refetch()}
      />
    ) : (
      <LoadingRows rows={3} shape="twoLines" label={t("loading")} />
    );
  }
  return (
    <>
      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-section font-semibold">{t("callsHeading")}</h2>
        {library.data.calls.map((call) => (
          <ModelCallCard key={call.name} call={call} />
        ))}
      </section>
      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-section font-semibold">{t("piecesHeading")}</h2>
        {library.data.pieces.map((piece) => (
          <Card key={piece.name}>
            <CardHeader>
              <CardTitle role="heading" aria-level={3}>
                <span className="numbers wrap-anywhere">{piece.name}</span>
              </CardTitle>
              <CardDescription>
                {t("version", { version: piece.version, day: formatCalendarDay(piece.changedOn) })}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {piece.name === "fixed.texts" && <p>{t("fixedTexts")}</p>}
              <TraceText text={piece.text} label={piece.name} />
            </CardContent>
          </Card>
        ))}
      </section>
    </>
  );
}

export function PromptLibraryScreen() {
  const t = useTranslations("consoleAi");
  const superAdmin = isSuperAdmin(useStaff());
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("prompts.title")} intro={t("prompts.intro")} />
      {superAdmin ? <PromptLibrary /> : <p>{t("superAdminsOnly")}</p>}
    </div>
  );
}
