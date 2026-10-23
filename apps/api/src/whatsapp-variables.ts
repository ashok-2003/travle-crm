// What the WhatsApp settings must look like (ADR 0035): the three names and the weakness check, apart from the environment so
// that the environment's schema can use them without a cycle.

/** The names of the three settings, which come all together or not at all. */
export const WHATSAPP_VARIABLES = ["MSG91_AUTHKEY", "MSG91_WEBHOOK_TOKEN", "MSG91_WEBHOOK_KEY"] as const;

/** A secret a person typed or copied from an example is no secret: too short, or fewer than 10 different characters. */
export function whatsappSecretIsWeak(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length < 32 || new Set(trimmed).size < 10;
}

/** The webhook's token goes into a URL path, so it holds only characters that need no escaping. */
export function isWebhookToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{32,200}$/.test(value);
}
