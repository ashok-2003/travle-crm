// WhatsApp's limits on reply buttons, checked before any request: MSG91 answers a bad message with an empty 400, so a
// mistake would otherwise show only as a failed send nobody can explain.
import type { WhatsAppButtonsToSend } from "./whatsapp-provider.js";

export const BUTTON_LIMITS = { buttons: 3, title: 20, id: 256, body: 1024, footer: 60 } as const;

/** Whether the message fits WhatsApp's reply-button limits (UTF-16 length, the stricter way to count). */
export function buttonsFit(message: WhatsAppButtonsToSend): boolean {
  const { buttons, body, footer } = message;
  if (buttons.length < 1 || buttons.length > BUTTON_LIMITS.buttons) return false;
  if (body.trim() === "" || body.length > BUTTON_LIMITS.body) return false;
  if (footer !== undefined && footer.length > BUTTON_LIMITS.footer) return false;
  if (new Set(buttons.map((button) => button.id)).size !== buttons.length) return false;
  return buttons.every(
    (button) =>
      button.id !== "" &&
      button.id.length <= BUTTON_LIMITS.id &&
      button.title.trim() !== "" &&
      button.title.length <= BUTTON_LIMITS.title,
  );
}
