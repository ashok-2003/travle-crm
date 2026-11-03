// Runs async work over a list with a fixed number in flight, for the dashboard's per-organization counts.

/**
 * Maps items with at most `limit` calls in flight, keeping the order of the items. Once any call fails, no lane starts
 * another item and the first error is thrown (after the calls already running have settled, so none is left unhandled).
 */
export async function mapConcurrently<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const state: { failure?: { error: unknown } } = {};
  const lane = async (): Promise<void> => {
    while (state.failure === undefined && next < items.length) {
      const index = next;
      next += 1;
      try {
        results[index] = await work(items[index] as T, index);
      } catch (error) {
        state.failure ??= { error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  if (state.failure) throw state.failure.error;
  return results;
}
