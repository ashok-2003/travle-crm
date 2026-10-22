// Sends the visitor's enquiry to the api (W28: same origin, JSON, no cookies) and says why when it was refused. A 5xx or
// no answer is tried once more by the form (website-form-view.tsx), which first gets a new Turnstile token: one works once.
import { z } from "zod";
import { FormRefusal } from "./refusal";

export const SEND_RETRY_DELAY_MS = 3_000;

export const publicFormUrl = (key: string) => `/api/public/website-forms/${encodeURIComponent(key)}`;

export function sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

const refusalBody = z.object({ reason: z.string() });

async function reasonOf(response: Response): Promise<string | null> {
  const parsed = refusalBody.safeParse(await response.json().catch(() => null));
  return parsed.success ? parsed.data.reason : null;
}

async function post(url: string, body: string): Promise<Response | null> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      cache: "no-store",
    });
  } catch {
    return null;
  }
}

export async function postEnquiry(key: string, enquiry: unknown): Promise<void> {
  const url = `${publicFormUrl(key)}/enquiries`;
  const body = JSON.stringify(enquiry);
  const response = await post(url, body);
  if (response?.ok) return;
  throw new FormRefusal(response === null ? null : await reasonOf(response), response?.status ?? 0);
}
