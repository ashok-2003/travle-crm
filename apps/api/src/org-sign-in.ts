// POST /api/auth/sign-in/org: sign in with organization code, username and password (spec 6.3).
// It builds the internal username and hands the request to Better Auth's username sign-in, so rate limiting, cookies,
// two-factor and hooks work exactly as for any other sign-in. The route is mounted behind requireTrustedJson (app.ts):
// this function re-labels any body as JSON, so Better Auth's own JSON-only gate can't protect it from cross-site posts.
import { orgSignInInput } from "@travel-crm/contracts/identity";
import { internalUsername, type Auth } from "@travel-crm/domain/identity";

export async function organizationSignIn(auth: Auth, request: Request): Promise<Response> {
  const parsed = orgSignInInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { code: "VALIDATION", message: "Give your organization code, username and password" },
      { status: 400 },
    );
  }
  const { orgCode, username, password } = parsed.data;
  // Keep every header (origin, cookies, the client's address for rate limits); the body is new.
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  return auth.handler(
    new Request(new URL("/api/auth/sign-in/username", request.url), {
      method: "POST",
      headers,
      body: JSON.stringify({ username: internalUsername(orgCode, username), password }),
    }),
  );
}
