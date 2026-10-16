// Lets a test read the console's mutation cache, to check that a temporary password isn't kept in it once the dialog
// that showed it has closed.
import { useQueryClient, type MutationCache } from "@tanstack/react-query";
import { useEffect } from "react";

const probed: { cache: MutationCache | null } = { cache: null };

export function CacheProbe() {
  const cache = useQueryClient().getMutationCache();
  useEffect(() => {
    probed.cache = cache;
  }, [cache]);
  return null;
}

/** The mutations the console's cache still holds. */
export const mutationsHeld = () => probed.cache?.getAll() ?? [];
