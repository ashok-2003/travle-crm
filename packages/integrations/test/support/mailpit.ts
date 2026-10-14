// Starts Mailpit, a local SMTP server with an HTTP API, so the email adapter's tests can read what was sent.
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";

export const MAILPIT_IMAGE = "axllent/mailpit:v1.31.5";

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
  /** One message's headers, each with all its values. */
  headers(messageId: string): Promise<Record<string, string[]>>;
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

  return {
    smtpHost: container.getHost(),
    smtpPort: container.getMappedPort(SMTP_PORT),
    messages: async () => {
      const list = await get<{ messages: { ID: string }[] }>("/messages");
      return Promise.all(list.messages.map((message) => get<MailpitMessage>(`/message/${message.ID}`)));
    },
    headers: (messageId) => get<Record<string, string[]>>(`/message/${messageId}/headers`),
    stop: async () => {
      await container.stop();
    },
  };
}
