// Listeners and a counting job queue for the jobs module's tests.
import { createMemoryJobQueue, type JobQueue, type MemoryJobQueue } from "@travel-crm/integrations/jobs";
import type { DomainEvent, EventListener, ListenerContext } from "../../src/jobs/index.js";
import { DomainError } from "../../src/kernel/index.js";

/** A listener that records the events it handles, and can be told to fail. */
export interface RecordingListener extends EventListener {
  readonly handled: DomainEvent[];
  failuresLeft: number;
}

export function recordingListener(
  name: string,
  eventType: string,
  handle?: EventListener["handle"],
): RecordingListener {
  const listener: RecordingListener = {
    name,
    eventType,
    handled: [],
    failuresLeft: 0,
    async handle(event: DomainEvent, context: ListenerContext) {
      if (listener.failuresLeft > 0) {
        listener.failuresLeft -= 1;
        // Our own error, with an email in it: pg-boss keeps the message, masked.
        throw new DomainError("CONFLICT", "FAILED_ON_PURPOSE", `${name} failed on purpose for jane.doe@example.com`);
      }
      listener.handled.push(event);
      if (handle) await handle(event, context);
    },
  };
  return listener;
}

/** A memory queue that also counts send calls, repeats included, to prove a relay never sends one event twice. */
export function countingQueue(): { queue: JobQueue; memory: MemoryJobQueue; calls: () => number } {
  const memory = createMemoryJobQueue();
  let calls = 0;
  return {
    memory,
    calls: () => calls,
    queue: {
      send: (name, data, options) => {
        calls += 1;
        return memory.send(name, data, options);
      },
    },
  };
}
