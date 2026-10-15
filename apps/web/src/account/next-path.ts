// Where to go after signing in: the ?next= page the person was sent from, if it is a page of this app, else home. A
// signed-out screen (sign-in, reset, offline) counts as no page at all: it would put the person back on a sign-in form.
import { isAppPath, isPublicRoute, PATH_BASE, routes } from "@/lib/routes";

export function nextPath(searchParams: Pick<URLSearchParams, "get">): string {
  const next = searchParams.get("next");
  if (next === null || !isAppPath(next)) return routes.home;
  // isAppPath has checked it resolves on our origin, so its pathname is the one the browser would open.
  return isPublicRoute(new URL(next, PATH_BASE).pathname) ? routes.home : next;
}
