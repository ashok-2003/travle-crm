// What a tab keeps between its own screens (sessionStorage), for what must never go in an address: the lead list's
// search, a customer's name or phone, which a URL would carry to the access logs and the Referer. Everything is kept
// under one prefix, so every wipe (data/session.ts) forgets it with the rest of the organization's data. Storage can
// be blocked or full: a read then finds nothing, a write keeps nothing, and the screen works on without it.
const PREFIX = "travel-crm.";

export function readTabValue(key: string): string | null {
  try {
    return window.sessionStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

/** Keeps a value for the tab's other screens; a blank removes it. */
export function keepTabValue(key: string, value: string): void {
  try {
    if (value === "") window.sessionStorage.removeItem(PREFIX + key);
    else window.sessionStorage.setItem(PREFIX + key, value);
  } catch {
    // Blocked or full: the value lasts as long as the screen holding it.
  }
}

/** Forgets every value the tab kept, and nothing else's. */
export function forgetTabValues(): void {
  try {
    const storage = window.sessionStorage;
    const kept = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
      (key): key is string => key?.startsWith(PREFIX) === true,
    );
    for (const key of kept) storage.removeItem(key);
  } catch {
    // Blocked storage kept nothing to forget.
  }
}
