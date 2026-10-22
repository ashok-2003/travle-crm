// The hosted form's page title, best effort: asks the api for the agency's name with a 2 second limit so a shared link
// previews as "Plan your trip with Sharma Travels". If the api is asleep, or the server does not know where it is, the
// preview is generic. Neither page is indexed (spec 5.1).
import { websiteFormPublic } from "@travel-crm/contracts/website-forms";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { publicFormUrl } from "./send-enquiry";

const TITLE_WAIT_MS = 2_000;

async function agencyNameOf(key: string): Promise<string | null> {
  const origin = process.env.API_ORIGIN;
  if (!origin) return null;
  try {
    const response = await fetch(`${origin}${publicFormUrl(key)}?via=hosted`, {
      cache: "no-store",
      signal: AbortSignal.timeout(TITLE_WAIT_MS),
    });
    if (!response.ok) return null;
    const parsed = websiteFormPublic.safeParse(await response.json());
    return parsed.success ? parsed.data.form.organizationName : null;
  } catch {
    return null;
  }
}

export async function hostedFormMetadata(key: string): Promise<Metadata> {
  const [t, name] = await Promise.all([getTranslations("websiteForm.page"), agencyNameOf(key)]);
  return { title: { absolute: name === null ? t("genericTitle") : t("title", { name }) } };
}
