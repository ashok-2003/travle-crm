// Which push endpoints we will call. A subscription's endpoint comes from a signed-in user's browser; calling an
// arbitrary one would let them make the worker send requests to internal addresses. Browsers' push services are a
// short, known list, all https.

const EXACT_HOSTS = new Set([
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "web.push.apple.com",
]);
const HOST_SUFFIXES = [".notify.windows.com", ".push.apple.com"];

/** True for an https URL on Google, Mozilla, Microsoft or Apple's push service. */
export function isKnownPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "") return false;
  const host = url.hostname.toLowerCase();
  return EXACT_HOSTS.has(host) || HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}
