// The Langfuse adapter of the tracing port: an isolated OpenTelemetry tracer provider that only Langfuse's span processor
// reads, so no other library's spans reach Langfuse and ours reach nothing else (the global provider is left alone). Phone
// numbers and email addresses are masked before export. A Langfuse that is down or slow is invisible: spans export in the
// background, flush and shutdown are bounded in time, every call into the SDK is caught, and the SDK's console logger is
// silenced.
import { LangfuseSpanProcessor } from "@langfuse/otel";
import {
  LangfuseAgent,
  type LangfuseRetriever,
  type LangfuseTool,
  propagateAttributes,
  setLangfuseTracerProvider,
  startActiveObservation,
  startObservation,
} from "@langfuse/tracing";
import { context, createContextKey } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { quietLangfuseSdk } from "../langfuse/sdk-logging.js";
import {
  failureOf,
  type AiTracing,
  type StepStart,
  type TraceNote,
  type TracedGeneration,
  type TracedPrompt,
  type TurnStart,
} from "./ai-tracing.js";
import { maskTraceData } from "./mask.js";

export interface LangfuseTracingOptions {
  publicKey: string;
  secretKey: string;
  /** The project's region, e.g. https://us.cloud.langfuse.com. */
  baseUrl: string;
  /** "production", "development"...: lowercase letters, digits, "-" and "_", at most 40. */
  environment: string;
  /** The build that sent the trace (a commit), when known. */
  release?: string;
  /** Seconds one export may take (5 by default); flush and shutdown wait at most a second longer. */
  timeoutSeconds?: number;
}

/** Where a turn keeps its observation in the async context, so a note finds its own turn and no other. */
const TURN = createContextKey("travel-crm.ai-turn");
/** Where a turn keeps its managed prompt, so each of its model calls is linked to it. */
const PROMPT = createContextKey("travel-crm.ai-turn-prompt");
const SESSION_LIMIT = 200;

/**
 * The running turn's prompt as a generation's `prompt` attribute (Langfuse's "link prompts to traces", manual
 * observations): never a fallback, since the built-in text is no prompt of Langfuse's.
 */
function linkedPrompt(): { prompt?: TracedPrompt & { isFallback: false } } {
  const prompt = context.active().getValue(PROMPT) as TracedPrompt | undefined;
  return prompt === undefined ? {} : { prompt: { name: prompt.name, version: prompt.version, isFallback: false } };
}

/** The async context a turn's work runs in: its observation, and its prompt (a turn without one shows none). */
function turnScope(agent: LangfuseAgent, prompt: TracedPrompt | undefined) {
  const scope = context.active().setValue(TURN, agent);
  return prompt === undefined ? scope.deleteValue(PROMPT) : scope.setValue(PROMPT, prompt);
}

/** A call into the SDK whose failure costs the trace a detail, never the work. */
function quietly(call: () => unknown): void {
  try {
    call();
  } catch {
    // The trace loses this; what it traces goes on.
  }
}

/** Waits for `work` at most `ms`; neither its failure nor its hanging reaches the caller. */
async function within(ms: number, work: () => Promise<unknown>): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
    timer.unref();
  });
  try {
    await Promise.race([
      Promise.resolve()
        .then(work)
        .catch(() => undefined),
      late,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** The note's fields that are set: an attribute given as undefined would clear what an earlier note set. */
function attributesOf(note: TraceNote) {
  return {
    ...(note.input === undefined ? {} : { input: note.input }),
    ...(note.output === undefined ? {} : { output: note.output }),
    ...(note.metadata === undefined ? {} : { metadata: note.metadata }),
    ...(note.level === undefined ? {} : { level: note.level }),
    ...(note.statusMessage === undefined ? {} : { statusMessage: note.statusMessage }),
  };
}

/** What every observation of the turn carries: its chat, its staff member, its tags and its organization. */
const traceAttributes = (start: TurnStart) => ({
  sessionId: start.sessionId.slice(0, SESSION_LIMIT),
  traceName: start.name,
  metadata: { organizationId: start.organizationId },
  ...(start.userId === undefined ? {} : { userId: start.userId }),
  ...(start.tags === undefined ? {} : { tags: [...start.tags] }),
});

/** Runs `fn` inside an active observation of the step's type. */
function observeStep<R>(start: StepStart, fn: (step: LangfuseRetriever | LangfuseTool) => Promise<R>): Promise<R> {
  return start.type === "tool"
    ? startActiveObservation(start.name, fn, { asType: "tool" })
    : startActiveObservation(start.name, fn, { asType: "retriever" });
}

let contextReady = false;

export function createLangfuseTracing(options: LangfuseTracingOptions): AiTracing {
  quietLangfuseSdk();
  const timeoutSeconds = options.timeoutSeconds ?? 5;
  const boundMs = (timeoutSeconds + 1) * 1000;
  const provider = new NodeTracerProvider({
    spanProcessors: [
      new LangfuseSpanProcessor({
        publicKey: options.publicKey,
        secretKey: options.secretKey,
        baseUrl: options.baseUrl,
        environment: options.environment,
        ...(options.release === undefined ? {} : { release: options.release }),
        timeout: timeoutSeconds,
        mask: maskTraceData,
        // Attachments are traced as placeholders: no base64 for the processor to look for, nothing to upload.
        mediaUploadEnabled: false,
      }),
    ],
  });
  // Nesting follows async work only with a context manager: one per process, set once.
  if (!contextReady) {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
    contextReady = true;
  }
  setLangfuseTracerProvider(provider);

  return {
    async turn(start, work) {
      let running: ReturnType<typeof work> | undefined;
      // The work runs once, whatever the tracing does: inside the turn, or (when the tracing failed first) outside it.
      const run = () => (running ??= Promise.resolve().then(work));
      try {
        await startActiveObservation(
          start.name,
          async (agent) => {
            quietly(() =>
              agent.update(
                attributesOf({
                  input: start.input,
                  ...(start.metadata === undefined ? {} : { metadata: start.metadata }),
                }),
              ),
            );
            await propagateAttributes(traceAttributes(start), () =>
              context.with(turnScope(agent, start.prompt), async () => {
                try {
                  await run();
                } catch (error) {
                  // Caught here, so the SDK never records the error's message: its name and code only.
                  quietly(() => agent.update({ level: "ERROR", statusMessage: failureOf(error) }));
                }
              }),
            );
          },
          { asType: "agent" },
        );
      } catch {
        // The tracing failed: the work runs, or ran, as it would have without it.
      }
      return run();
    },
    async step(start, work, ended) {
      let running: ReturnType<typeof work> | undefined;
      const run = () => (running ??= Promise.resolve().then(work));
      try {
        await observeStep(start, async (step) => {
          quietly(() =>
            step.update(
              attributesOf({
                input: start.input,
                ...(start.metadata === undefined ? {} : { metadata: start.metadata }),
              }),
            ),
          );
          try {
            const result = await run();
            if (ended !== undefined) quietly(() => step.update(attributesOf(ended(result))));
          } catch (error) {
            quietly(() => step.update({ level: "ERROR", statusMessage: failureOf(error) }));
          }
        });
      } catch {
        // The tracing failed: the work runs, or ran, as it would have without it.
      }
      return run();
    },
    note(note) {
      quietly(() => {
        const turn = context.active().getValue(TURN);
        if (turn instanceof LangfuseAgent) turn.update(attributesOf(note));
      });
    },
    generation(start): TracedGeneration {
      try {
        const call = startObservation(
          start.name,
          {
            input: start.input,
            ...(start.model === undefined ? {} : { model: start.model }),
            ...(start.modelParameters === undefined ? {} : { modelParameters: start.modelParameters }),
            ...(start.metadata === undefined ? {} : { metadata: start.metadata }),
            ...linkedPrompt(),
          },
          { asType: "generation" },
        );
        let ended = false;
        return {
          end(result) {
            if (ended) return;
            ended = true;
            quietly(() => {
              call
                .update({
                  ...attributesOf(result),
                  ...(result.model === undefined ? {} : { model: result.model }),
                  ...(result.usage === undefined ? {} : { usageDetails: { ...result.usage } }),
                })
                .end();
            });
          },
        };
      } catch {
        return { end: () => undefined };
      }
    },
    flush: () => within(boundMs, () => provider.forceFlush()),
    async shutdown() {
      await within(boundMs, () => provider.shutdown());
      quietly(() => {
        setLangfuseTracerProvider(null);
      });
    },
  };
}
