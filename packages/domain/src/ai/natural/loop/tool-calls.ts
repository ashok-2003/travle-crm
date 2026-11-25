// A tool call's work that failed (the database) comes back as a refusal the model can act on, never a throw (Review
// Focus 2).

export const READ_FAILED =
  "refused: that couldn't be read just now; answer from what you have, or say you'll check and come back, and " +
  "call create_task";
export const STAGE_FAILED =
  "refused: that couldn't be checked just now; say you'll check and come back, and call create_task";

/** The work's answer, or the name of what it threw (a database failure): the loop goes on without it. */
export async function settled<T>(work: () => Promise<T>): Promise<{ value: T } | { failed: string }> {
  try {
    return { value: await work() };
  } catch (error) {
    return { failed: error instanceof Error ? error.name : "unknown" };
  }
}
