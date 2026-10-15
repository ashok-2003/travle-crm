// Starts Mailpit, a local SMTP server with an HTTP API, so the api's tests can read what the real SMTP sender sent.
// The same image as the integrations package's adapter tests.
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";

const MAILPIT_IMAGE = "axllent/mailpit:v1.31.5";
const SMTP_PORT = 1025;
const API_PORT = 8025;

interface MailpitAddress {
  Name: string;
  Address: string;
}

/** A message as Mailpit's API returns it. */
export interface MailpitMessage {
  ID: string;
  From: MailpitAddress;
  To: MailpitAddress[];
  ReplyTo: MailpitAddress[];
  Subject: string;
  Text: string;
  HTML: string;
}

export interface Mailpit {
  smtpHost: string;
  smtpPort: number;
  /** Every message received, newest first, in full. */
  messages(): Promise<MailpitMessage[]>;
  /** Waits until count messages have arrived (sending happens after the request answers), and returns them all. */
  messagesOnceThereAre(count: number): Promise<MailpitMessage[]>;
  stop(): Promise<void>;
}

export async function startMailpit(): Promise<Mailpit> {
  const container: StartedTestContainer = await new GenericContainer(MAILPIT_IMAGE)
    .withExposedPorts(SMTP_PORT, API_PORT)
    .withWaitStrategy(Wait.forHttp("/readyz", API_PORT))
    .start();
  const api = `http://${container.getHost()}:${String(container.getMappedPort(API_PORT))}/api/v1`;
  const get = async <T>(path: string): Promise<T> => {
    const response = await fetch(`${api}${path}`);
    if (!response.ok) throw new Error(`Mailpit ${path} answered ${String(response.status)}`);
    return (await response.json()) as T;
  };
  const messages = async () => {
    const list = await get<{ messages: { ID: string }[] }>("/messages");
    return Promise.all(list.messages.map((message) => get<MailpitMessage>(`/message/${message.ID}`)));
  };

  return {
    smtpHost: container.getHost(),
    smtpPort: container.getMappedPort(SMTP_PORT),
    messages,
    messagesOnceThereAre: async (count) => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const received = await messages();
        if (received.length >= count) return received;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(`Mailpit received fewer than ${String(count)} messages`);
    },
    stop: async () => {
      await container.stop();
    },
  };
}
