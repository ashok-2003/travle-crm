"use client";

// What replaces the form after a send (spec 3.6): a check, the agency's thank-you and its website button. The same screen
// follows every outcome that is not a refusal (W20). Focus moves to the heading so a screen reader hears it.
import { CircleCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { PageTitle } from "@/components/page-title";
import type { PublicForm } from "@travel-crm/contracts/website-forms";
import { WebsiteButton } from "./website-button";

export function ThankYou({ form, embedded }: { form: PublicForm; embedded: boolean }) {
  const t = useTranslations("websiteForm.page");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <div role="status" className="flex flex-col items-center gap-4 py-12 text-center">
      <CircleCheckIcon aria-hidden="true" className="size-10 text-status-good-ink" strokeWidth={1.25} />
      <PageTitle>
        <span ref={heading} tabIndex={-1} className="outline-none">
          {t("thanks")}
        </span>
      </PageTitle>
      <p className="max-w-[40ch] [overflow-wrap:anywhere] whitespace-pre-line">{form.thankYouMessage}</p>
      <WebsiteButton url={form.websiteUrl} text={form.websiteButtonText} embedded={embedded} />
    </div>
  );
}
