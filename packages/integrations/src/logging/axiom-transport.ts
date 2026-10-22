// A pino transport that ships lines to Axiom (ADR 0032), run by pino in a worker thread of its own, so a request never
// waits on the network. Lines are batched (100, or a second's worth) and posted as newline-delimited JSON to the
// dataset's ingest endpoint by a sender that runs beside the consumer: the consumer never awaits the network, so a slow
// Axiom can't fill the ring buffer the main thread writes into (a full buffer blocks that thread). At most MAX_BATCHES
// wait; past that the oldest are dropped and counted. A failed post is retried twice, then dropped. The lines are also on
// standard output, which is the log of record. Closing the logger ends the stream: one last post with a short timeout and
// no retries, then the thread stops. The token is only ever in the Authorization header; nothing here prints it.
import build from "pino-abstract-transport";

export interface AxiomTransportOptions {
  token: string;
  dataset: string;
  /** Axiom's API address: https://api.axiom.co, or the EU region's https://api.eu.axiom.co. */
  url: string;
}

const BATCH_LINES = 100;
const MAX_BATCHES = 20;
const FLUSH_AFTER_MS = 1000;
const POST_TIMEOUT_MS = 10_000;
const FINAL_POST_TIMEOUT_MS = 3000;
const RETRIES = 2;
const RETRY_WAIT_MS = 500;

/** Axiom reads a line's time from `_time`; ours is `time`, an ISO string. */
function forAxiom(line: Record<string, unknown>): string {
  const { time, ...rest } = line;
  return JSON.stringify(typeof time === "string" ? { _time: time, ...rest } : rest);
}

/** The result of a post: its HTTP status (0 when it never got one). */
async function post(options: AxiomTransportOptions, body: string, timeoutMs: number): Promise<number> {
  try {
    const response = await fetch(`${options.url}/v1/datasets/${encodeURIComponent(options.dataset)}/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${options.token}`, "Content-Type": "application/x-ndjson" },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.status;
  } catch {
    return 0;
  }
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export default function axiomTransport(options: AxiomTransportOptions) {
  let current: string[] = [];
  const waiting: string[][] = [];
  let timer: NodeJS.Timeout | undefined;
  let sender: Promise<void> | undefined;
  let dropped = 0;
  let reportedStatus = false;
  let closing = false;

  /** Says, once, the first status that wasn't a success (Axiom's answer, never its body); 0 is no answer at all. */
  const noteStatus = (status: number) => {
    if ((status >= 200 && status < 300) || reportedStatus) return;
    reportedStatus = true;
    process.stderr.write(`axiom: ingest ${status === 0 ? "did not answer" : `answered ${String(status)}`}\n`);
  };

  const seal = () => {
    clearTimeout(timer);
    timer = undefined;
    if (current.length === 0) return;
    waiting.push(current);
    current = [];
    // The oldest go first when Axiom can't keep up.
    while (waiting.length > MAX_BATCHES) dropped += waiting.shift()?.length ?? 0;
  };

  const send = async () => {
    for (let batch = waiting.shift(); batch !== undefined && !closing; batch = waiting.shift()) {
      let status = 0;
      for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
        status = await post(options, batch.join("\n"), POST_TIMEOUT_MS);
        // Success, or a refusal a retry won't change (the token, the dataset).
        if (status < 300 || (status >= 400 && status < 500 && status !== 429)) break;
        if (attempt < RETRIES) await delay(RETRY_WAIT_MS * (attempt + 1));
      }
      noteStatus(status);
      if (status < 200 || status >= 300) dropped += batch.length;
    }
    sender = undefined;
  };

  const kick = () => {
    seal();
    sender ??= send();
  };

  return build(
    async (source) => {
      for await (const line of source as AsyncIterable<Record<string, unknown>>) {
        current.push(forAxiom(line));
        if (current.length >= BATCH_LINES) kick();
        else timer ??= setTimeout(kick, FLUSH_AFTER_MS);
      }
    },
    {
      close: async () => {
        closing = true;
        seal();
        // A post already under way gets a moment to finish.
        await Promise.race([sender, delay(FINAL_POST_TIMEOUT_MS)]);
        // One last try for everything still here, in one post with a short timeout and no retries, however it ends.
        const rest = waiting.splice(0).flat();
        if (rest.length > 0) {
          const status = await Promise.race([
            post(options, rest.join("\n"), FINAL_POST_TIMEOUT_MS),
            delay(FINAL_POST_TIMEOUT_MS).then(() => 0),
          ]);
          noteStatus(status);
          if (status < 200 || status >= 300) dropped += rest.length;
        }
        if (dropped > 0) process.stderr.write(`axiom: ${String(dropped)} log lines could not be shipped\n`);
      },
    },
  );
}
