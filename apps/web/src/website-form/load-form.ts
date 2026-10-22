// Asks the api for the form (spec 5.1): plain fetch, never tRPC and never the query cache, so nothing is stored. The
// answer is one of the page's states; "asleep" means no answer yet (the pilot's api wakes in about a minute, W42).
import { websiteFormPublic, type ClosedPublicForm, type PublicForm } from "@travel-crm/contracts/website-forms";
import { publicFormUrl } from "./send-enquiry";

export type LoadedForm =
  | { state: "ready"; form: PublicForm }
  | { state: "unavailable"; form: ClosedPublicForm }
  | { state: "not-found" }
  | { state: "failed" };

export async function fetchPublicForm(key: string, signal?: AbortSignal): Promise<LoadedForm | "asleep"> {
  let response: Response;
  try {
    response = await fetch(publicFormUrl(key), { cache: "no-store", ...(signal && { signal }) });
  } catch {
    return "asleep";
  }
  if (response.status === 404) return { state: "not-found" };
  if (response.status >= 502 && response.status <= 504) return "asleep";
  if (!response.ok) return { state: "failed" };
  const parsed = websiteFormPublic.safeParse(await response.json().catch(() => null));
  if (!parsed.success) return { state: "failed" };
  return parsed.data.available
    ? { state: "ready", form: parsed.data.form }
    : { state: "unavailable", form: parsed.data.form };
}
