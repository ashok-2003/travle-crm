// Where to go after signing in: the ?next= page the person was sent from, if it is a page of this app, else home.
import { isAppPath, routes } from "@/lib/routes";

export function nextPath(searchParams: Pick<URLSearchParams, "get">): string {
  const next = searchParams.get("next");
  return next !== null && isAppPath(next) ? next : routes.home;
}
