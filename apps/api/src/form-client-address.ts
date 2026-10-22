// Reads a form visitor's address by a configured number of proxy hops (W32); sign-in keeps its stricter reader.
import { clientAddressFrom, countedAddress, parseHop, type ClientAddressSettings } from "./rate-limit.js";

export interface FormAddressSettings extends ClientAddressSettings {
  /** How many entries our own infrastructure appends to the header (PUBLIC_FORM_PROXY_HOPS); null when unset. */
  proxyHops: number | null;
}

/** The entries of the first configured header that is present, in order; none when no such header. */
function entriesOf(request: Request, headerNames: readonly string[]): string[] {
  const header = headerNames.find((name) => request.headers.has(name));
  if (header === undefined) return [];
  return (request.headers.get(header) ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");
}

/**
 * With N hops and k entries the visitor is entry k-N from the left: the last N were added by our own proxies, and
 * whatever a visitor sent sits to their left. Fewer than N+1 entries, or an invalid one, is no address (null), which
 * the form limits skip rather than share. Unset hops follow sign-in's rule, so a proxy that overwrites the header
 * (Oracle's Caddy) needs nothing.
 */
export function formClientAddressFrom(settings: FormAddressSettings): (request: Request) => string | null {
  if (settings.proxyHops === null) return clientAddressFrom(settings);
  const hops = settings.proxyHops;
  return (request) => {
    const entries = entriesOf(request, settings.headerNames);
    if (entries.length < hops + 1) return null;
    const hop = parseHop(entries[entries.length - 1 - hops] ?? "");
    return hop ? countedAddress(hop) : null;
  };
}

/** What GET /api/public/client-address shows (W33): the counted address, how many entries, the setting. */
export function clientAddressReport(
  request: Request,
  settings: FormAddressSettings,
): { address: string | null; entries: number; hops: number | null } {
  return {
    address: formClientAddressFrom(settings)(request),
    entries: entriesOf(request, settings.headerNames).length,
    hops: settings.proxyHops,
  };
}
