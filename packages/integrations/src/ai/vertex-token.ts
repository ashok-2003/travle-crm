// A Google service account's OAuth token for Gemini on Vertex AI (ruling R14), from google-auth-library's JWT as the
// Sheets adapter uses it: the library keeps the token (an hour) and mints the next five minutes before it expires. The
// key and the token go nowhere else: not in a log, an error or a request but the endpoint's own header. A failure to mint
// is logged by the error's name and code alone, so a revoked key isn't mistaken for Google being down.
import { JWT } from "google-auth-library";
import { errorFields, type Logger } from "../logging/index.js";

const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

/** What gives the adapter a current token; `fetch` is for tests (Google's token endpoint is called through it). */
export function serviceAccountToken(
  key: { client_email: string; private_key: string },
  logger: Logger,
  fetch?: typeof globalThis.fetch,
): () => Promise<string> {
  const jwt = new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: [CLOUD_PLATFORM_SCOPE],
    transporterOptions: { timeout: 20_000, ...(fetch === undefined ? {} : { fetchImplementation: fetch }) },
  });
  return async () => {
    try {
      const { token } = await jwt.getAccessToken();
      if (typeof token !== "string" || token === "") throw new Error("Google gave no access token");
      return token;
    } catch (error) {
      logger.warn({ source: "vertex-token", ...errorFields(error) }, "Vertex AI: the service account's token failed");
      throw error;
    }
  };
}
