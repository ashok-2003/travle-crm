// WhatsApp's voice note formats through the AI port: an OGG note goes to OpenRouter as input_audio with its format (to
// Google AI Studio labelled mp3), the content types WhatsApp sends map to a format (none for AMR), and a trace names a
// note by format and size, never bytes.
import { describe, expect, it } from "vitest";
import { audioFormatOf, createMemoryAiModel, createOpenRouterModel, withTracing } from "../../src/ai/index.js";
import { createMemoryTracing } from "../../src/tracing/index.js";

/** A WhatsApp voice note's part, its format found the way the media reader finds it (so these tests need audioFormatOf). */
function voiceNote(bytes: Uint8Array) {
  const format = audioFormatOf("audio/ogg; codecs=opus");
  if (format === null) throw new Error("an OGG voice note has no format");
  return { type: "audio" as const, format, bytes };
}

describe("voice notes in the AI port", () => {
  it("sends an OGG voice note as input_audio with its format", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetcher: typeof fetch = (_url, init) => {
      bodies.push(JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<string, unknown>);
      return Promise.resolve(
        new Response(JSON.stringify({ model: "m", choices: [{ message: { content: "ok" }, finish_reason: "stop" }] })),
      );
    };
    const model = createOpenRouterModel({
      apiKey: "sk-or-secret-key-1234567890",
      models: { sales_agent: ["g/flash"] },
      fetch: fetcher,
    });
    await model.complete({
      feature: "sales_agent",
      messages: [
        {
          role: "user",
          content: "Transcribe",
          attachments: [voiceNote(new Uint8Array([1, 2, 3]))],
        },
      ],
    });
    const sent = bodies[0]?.messages as { content: unknown }[];
    expect(sent[0]?.content).toEqual([
      { type: "text", text: "Transcribe" },
      { type: "input_audio", input_audio: { data: "AQID", format: "ogg" } },
    ]);
  });

  it("labels a voice note mp3 for Google AI Studio, whose format takes only wav or mp3 and reads the audio itself", async () => {
    // Live from 21 Nov: AI Studio answered 400 "Invalid audio format \"ogg\"... Valid formats are: [wav, mp3]" to every
    // WhatsApp voice note; the same OGG bytes labelled mp3 or wav are transcribed (tried 2026-11-27).
    const bodies: Record<string, unknown>[] = [];
    const fetcher: typeof fetch = (_url, init) => {
      bodies.push(JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<string, unknown>);
      return Promise.resolve(
        new Response(JSON.stringify({ model: "m", choices: [{ message: { content: "ok" }, finish_reason: "stop" }] })),
      );
    };
    const model = createOpenRouterModel({
      apiKey: "ai-studio-key-1234567890",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      models: { sales_agent: ["gemini-3.5-flash-lite"] },
      fetch: fetcher,
    });
    const wav = { type: "audio" as const, format: "wav" as const, bytes: new Uint8Array([4]) };
    await model.complete({
      feature: "sales_agent",
      messages: [{ role: "user", content: "Transcribe", attachments: [voiceNote(new Uint8Array([1, 2, 3])), wav] }],
    });
    const sent = bodies[0]?.messages as { content: unknown }[];
    expect(sent[0]?.content).toEqual([
      { type: "text", text: "Transcribe" },
      { type: "input_audio", input_audio: { data: "AQID", format: "mp3" } },
      { type: "input_audio", input_audio: { data: "BA==", format: "wav" } },
    ]);
  });

  it("knows WhatsApp's audio types, and none for AMR", () => {
    expect(audioFormatOf("audio/ogg")).toBe("ogg");
    expect(audioFormatOf("audio/ogg; codecs=opus")).toBe("ogg");
    expect(audioFormatOf("audio/mpeg")).toBe("mp3");
    expect(audioFormatOf("audio/aac")).toBe("aac");
    expect(audioFormatOf("audio/mp4")).toBe("m4a");
    expect(audioFormatOf("audio/wav")).toBe("wav");
    expect(audioFormatOf("AUDIO/OGG")).toBe("ogg");
    expect(audioFormatOf("audio/mp3")).toBe("mp3");
    expect(audioFormatOf("audio/x-wav")).toBe("wav");
    expect(audioFormatOf("audio/wave")).toBe("wav");
    expect(audioFormatOf("audio/x-m4a")).toBe("m4a");
    expect(audioFormatOf("audio/opus")).toBe("ogg");
    expect(audioFormatOf("audio/amr")).toBeNull();
    expect(audioFormatOf("video/mp4")).toBeNull();
    expect(audioFormatOf("")).toBeNull();
  });

  it("traces a voice note by its format and size, never its bytes", async () => {
    const tracing = createMemoryTracing();
    const inner = createMemoryAiModel();
    inner.answer("hello");
    await withTracing(inner, tracing).complete({
      feature: "sales_agent",
      messages: [
        {
          role: "user",
          content: "Transcribe",
          attachments: [voiceNote(new Uint8Array(4096))],
        },
      ],
    });
    const input = JSON.stringify(tracing.generations[0]?.start.input);
    expect(input).toContain("[audio ogg, 4 KB]");
    expect(input).not.toContain("AAAA");
  });
});
