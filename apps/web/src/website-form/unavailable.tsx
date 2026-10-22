"use client";

// The states where the form cannot be used (spec 3.8). A closed form shows one sentence whatever the reason (a visitor
// must not learn that an agency has not paid), with the agency's name, logo and website button. A key that does not exist,
// or the old one after Change the link, shows no name and no logo. A form that could not be loaded offers Try again.
import { useTranslations } from "next-intl";
import type { ClosedPublicForm } from "@travel-crm/contracts/website-forms";
import { Button } from "@/components/ui/button";
import { AgencyMark } from "./agency-mark";
import { WebsiteButton } from "./website-button";

export function FormUnavailable({ form, embedded }: { form: ClosedPublicForm; embedded: boolean }) {
  const t = useTranslations("websiteForm.page");
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <AgencyMark name={form.organizationName} logoUrl={form.logoUrl} />
      <p role="status" className="text-muted-foreground">
        {t("unavailable")}
      </p>
      <WebsiteButton url={form.websiteUrl} text={form.websiteButtonText} embedded={embedded} />
    </div>
  );
}

export function FormNotFound() {
  const t = useTranslations("websiteForm.page");
  return (
    <p role="status" className="py-12 text-center text-muted-foreground">
      {t("notFound")}
    </p>
  );
}

export function FormLoadFailed({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("websiteForm.page");
  return (
    <div role="alert" className="flex flex-col items-center gap-4 py-12 text-center">
      <p className="text-muted-foreground">{t("failed")}</p>
      <Button variant="outline" onClick={onRetry}>
        {t("tryAgain")}
      </Button>
    </div>
  );
}
