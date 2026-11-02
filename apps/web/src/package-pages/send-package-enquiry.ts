// Sends a visitor's enquiry from a package page to the api (same origin, JSON, no cookies) and says why it was refused. The
// refusal is the website form's (FormRefusal), so its sentences are the form's.
import { z } from "zod";
import { FormRefusal } from "@/website-form/refusal";

export const packageEnquiryUrl = (code: string, slug: string) =>
  `/api/public/packages/${encodeURIComponent(code)}/${encodeURIComponent(slug)}/enquiries`;

const refusalBody = z.object({ reason: z.string() });

export async function postPackageEnquiry(code: string, slug: string, enquiry: unknown): Promise<void> {
  let response: Response | null;
  try {
    response = await fetch(packageEnquiryUrl(code, slug), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(enquiry),
      cache: "no-store",
    });
  } catch {
    response = null;
  }
  if (response?.ok) return;
  const parsed = refusalBody.safeParse(await response?.json().catch(() => null));
  throw new FormRefusal(parsed.success ? parsed.data.reason : null, response?.status ?? 0);
}
