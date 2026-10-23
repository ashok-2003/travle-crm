"use client";

// After "Also check the last 30 days": the worker reads the form's leads from Facebook and starts an import named after
// the form, which the api doesn't hand back (it happens a moment after the form is brought in). This waits for the form to
// name its import, asking every 2 seconds, and opens the import's preview. A form with no lead in the last 30 days never
// gets one: after half a minute the person is taken back to the Page.
import { useQuery } from "@tanstack/react-query";
import { LoaderCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { useTRPC } from "@/data/trpc";
import { leadImportRoute, metaPageRoute } from "@/lib/routes";

const GIVE_UP_AFTER_MS = 30_000;

export function ReadingEarlier({ pageId, formId }: { pageId: string; formId: string }) {
  const t = useTranslations("metaLeads.bringIn.reading30");
  const trpc = useTRPC();
  const router = useRouter();
  const forms = useQuery({ ...trpc.metaLeads.forms.queryOptions({ pageId }), refetchInterval: 2000 });
  const importId = forms.data?.items.find((form) => form.id === formId)?.earlierImportId ?? null;

  useEffect(() => {
    if (importId === null) return;
    router.replace(leadImportRoute(importId));
  }, [importId, router]);
  useEffect(() => {
    const timer = setTimeout(() => {
      toast(t("none"));
      router.replace(metaPageRoute(pageId));
    }, GIVE_UP_AFTER_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [pageId, router, t]);

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <PageHeader title={t("title")} />
      <div role="status" className="flex items-center gap-3">
        <LoaderCircleIcon aria-hidden="true" className="size-5 motion-safe:animate-spin" />
        <p>{t("body")}</p>
      </div>
    </div>
  );
}
