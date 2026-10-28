// Signs staff in with the organization code through the api, as the sign-in screen does, so organization journeys
// can act as them without depending on that screen.
import type { APIRequestContext } from "@playwright/test";
import { expect, skipWelcome } from "./fixtures";

export async function signInWithCode(
  request: APIRequestContext,
  credentials: { orgCode: string; username: string; password: string },
): Promise<void> {
  const response = await request.post("/api/auth/sign-in/org", {
    data: credentials,
    // The api accepts sign-ins only from the web app's own origin, which a browser would send.
    headers: { origin: process.env.E2E_BASE_URL ?? "" },
  });
  expect(response.status()).toBe(200);
  await skipWelcome(request);
}
