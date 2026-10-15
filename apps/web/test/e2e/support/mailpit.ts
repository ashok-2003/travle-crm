// Email for the journeys: Mailpit in a container, a local SMTP server with an HTTP API, as the api's own tests start it
// (apps/api/test/support/mailpit.ts, the same image pin). The api sends to it, and a journey reads what arrived,
// such as the reset link in a forgot-password email.
import { GenericContainer, Wait } from "testcontainers";

const IMAGE = "axllent/mailpit:v1.31.5";
const SMTP_PORT = 1025;
const API_PORT = 8025;

/** The api's SMTP settings for this Mailpit, as its environment variables. */
export type EmailVariables = Record<"SMTP_HOST" | "SMTP_PORT", string>;

export interface Mailpit {
  variables: EmailVariables;
  /** Mailpit's HTTP address, for the journeys (E2E_MAILPIT_URL). */
  url: string;
  stop(): Promise<void>;
}

export async function startMailpit(): Promise<Mailpit> {
  const container = await new GenericContainer(IMAGE)
    .withExposedPorts(SMTP_PORT, API_PORT)
    .withWaitStrategy(Wait.forHttp("/readyz", API_PORT))
    .start();
  return {
    variables: { SMTP_HOST: container.getHost(), SMTP_PORT: String(container.getMappedPort(SMTP_PORT)) },
    url: `http://${container.getHost()}:${String(container.getMappedPort(API_PORT))}`,
    stop: async () => {
      await container.stop();
    },
  };
}

interface MessageSummary {
  ID: string;
  To: { Address: string }[];
}

async function read<T>(path: string): Promise<T> {
  const base = process.env.E2E_MAILPIT_URL;
  if (!base) throw new Error("E2E_MAILPIT_URL is not set: run the journeys with `pnpm --filter @travel-crm/web e2e`");
  const response = await fetch(`${base}/api/v1${path}`);
  if (!response.ok) throw new Error(`Mailpit ${path} answered ${String(response.status)}`);
  return (await response.json()) as T;
}

/**
 * The reset link in the email sent to address, waiting up to 10 seconds: the api sends after answering the request.
 * Each journey's agency has its own address, so journeys running side by side never read each other's mail.
 */
export async function resetLinkSentTo(address: string): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const { messages } = await read<{ messages: MessageSummary[] }>("/messages");
    const sent = messages.find((message) => message.To.some((to) => to.Address === address));
    if (sent) {
      const { Text } = await read<{ Text: string }>(`/message/${sent.ID}`);
      const link = /https?:\/\/\S+\/api\/auth\/reset-password\/\S+/.exec(Text)?.[0];
      if (!link) throw new Error("the reset email holds no reset link");
      return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`no email reached ${address}`);
}
