// Langfuse's SDK writes its own lines to the console (a failed prompt fetch, a failed export), which the repo's rule
// forbids: they are not JSON, and an error printed whole can carry its message. One logger serves @langfuse/client,
// @langfuse/tracing and @langfuse/otel (they share @langfuse/core), so the Langfuse adapters silence it once, as each is
// made; each adapter says what went wrong through the Logger port instead.
import { configureGlobalLogger, LogLevel } from "@langfuse/core";

let quiet = false;

export function quietLangfuseSdk(): void {
  if (quiet) return;
  configureGlobalLogger({ level: LogLevel.NONE });
  quiet = true;
}
