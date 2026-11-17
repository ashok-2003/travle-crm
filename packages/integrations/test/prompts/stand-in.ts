// A local stand-in for Langfuse's prompts API, for the prompts adapter's tests: it keeps each request it gets and answers
// as the test says, a text prompt version by default.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export const NAME = "whatsapp-agent/natural-system";

/** Langfuse's answer for one text prompt version. */
export const textPrompt = (version: number, prompt: string, labels = ["production"]) => ({
  id: `prompt-${String(version)}`,
  name: NAME,
  version,
  type: "text",
  prompt,
  config: {},
  labels,
  tags: [],
  commitMessage: null,
});

export const json = (response: ServerResponse, status: number, body: unknown) =>
  response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));

export type Answer = (request: IncomingMessage, response: ServerResponse) => void;

export const answerVersion3: Answer = (_request, response) => {
  json(response, 200, textPrompt(3, "Hi, I'm {{agent_name}}."));
};

export interface StandIn {
  baseUrl: string;
  asked: { path: string; label: string | null; authorization: string | undefined }[];
  /** How the next requests are answered. */
  answer: Answer;
  close(): Promise<void>;
}

export async function startStandIn(): Promise<StandIn> {
  const standIn: StandIn = { baseUrl: "", asked: [], answer: answerVersion3, close: () => Promise.resolve() };
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    standIn.asked.push({
      path: url.pathname,
      label: url.searchParams.get("label"),
      authorization: request.headers.authorization,
    });
    standIn.answer(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  standIn.baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  standIn.close = async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) =>
      server.close(() => {
        resolve();
      }),
    );
  };
  return standIn;
}
