"use client";

// The tab's title once the agency is known: "Plan your trip with Sharma Travels". The layout's generic title stands until
// then, and when the form is missing. Set in the browser, so no server asks the api for it (that would count a page view).
import { useTranslations } from "next-intl";
import { useEffect } from "react";

export function useDocumentTitle(organizationName: string | null): void {
  const t = useTranslations("websiteForm.page");
  useEffect(() => {
    if (organizationName !== null) document.title = t("title", { name: organizationName });
  }, [organizationName, t]);
}
