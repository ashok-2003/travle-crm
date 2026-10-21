// "/" is the product's public page for visitors; someone signed in on this device goes straight on to their home.
// Only whether the session cookie is there is read, never its value: home's gate (me.get) still checks it, and sends
// anyone whose session has ended to sign in.
import { NextResponse, type NextRequest } from "next/server";
import { routes } from "@/lib/routes";

/** Better Auth's session cookie, under https (its __Secure- prefix) and in local development. */
const SESSION_COOKIES = ["__Secure-better-auth.session_token", "better-auth.session_token"];

export function proxy(request: NextRequest): NextResponse {
  if (SESSION_COOKIES.some((name) => request.cookies.has(name))) {
    return NextResponse.redirect(new URL(routes.home, request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: "/" };
