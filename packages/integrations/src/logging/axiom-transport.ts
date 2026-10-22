// A pino transport that ships lines to Axiom (ADR 0032), run by pino in a worker thread of its own, so a request never
// waits on the network. It batches lines (up to 100, or a second's worth), posts them as newline-delimited JSON to the
// dataset's ingest endpoint, retries a failed post twice, and drops the batch after that: the lines are also on standard
// output, which is the log of record. Closing the logger ends the stream, which posts what is queued before the thread
// stops. The token is only ever in the Authorization header; nothing here prints it.
import build from "pino-abstract-transport";

export interface AxiomTransportOptions {
  token: string;
  dataset: string;
  /** Axiom's API address: https://api.axiom.co, or the EU region's https://api.eu.axiom.co. */
  url: string;
}

const BATCH_LINES = 100;
const FLUSH_AFTER_MS = 1000;
const POST_TIMEOUT_MS = 10_000;
const RETRIES = 2;
const RETRY_WAIT_MS = 500;

/** Axiom reads a line's time from `_time`; ours is `time`, an ISO string. */
function forAxiom(line: Record<string, unknown>): string {
  const { time, ...rest } = line;
  return JSON.stringify(typeof time === "string" ? { _time: time, ...rest } : rest);
}

async function post(options: AxiomTransportOptions, body: string): Promise<boolean> {
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    try {
      const response = await fetch(`${options.url}/v1/datasets/${encodeURIComponent(options.dataset)}/ingest`, {
        method: "POST",
        headers: { Authorization: `Bearer ${options.token}`, "Content-Type": "application/x-ndjson" },
        body,
        signal: AbortSignal.timeout(POST_TIMEOUT_MS),
      });
      if (response.ok) return true;
      // A refusal for the token or the dataset won't change on a retry.
      if (response.status >= 400 && response.status < 500 && response.status !== 429) return false;
    } catch {
      // The network: try again.
    }
    if (attempt < RETRIES) await new Promise((resolve) => setTimeout(resolve, RETRY_WAIT_MS * (attempt + 1)));
  }
  return false;
}

export default function axiomTransport(options: AxiomTransportOptions) {
  let queued: string[] = [];
  let timer: NodeJS.Timeout | undefined;
  let sending: Promise<void> = Promise.resolve();
  let dropped = 0;

  const flush = (): Promise<void> => {
    clearTimeout(timer);
    timer = undefined;
    if (queued.length === 0) return sending;
    const batch = queued;
    queued = [];
    sending = sending.then(async () => {
      if (!(await post(options, batch.join("\n")))) dropped += batch.length;
    });
    return sending;
  };

  return build(
    async (source) => {
      for await (const line of source as AsyncIterable<Record<string, unknown>>) {
        queued.push(forAxiom(line));
        if (queued.length >= BATCH_LINES) await flush();
        else timer ??= setTimeout(() => void flush(), FLUSH_AFTER_MS);
      }
    },
    {
      close: async () => {
        await flush();
        // Once, at the end: a count, never a line or the reason.
        if (dropped > 0) process.stderr.write(`axiom: ${String(dropped)} log lines could not be shipped\n`);
      },
    },
  );
}
