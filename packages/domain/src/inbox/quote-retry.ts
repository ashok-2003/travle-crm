// A reply that quotes a message goes with its quote, and if MSG91 refuses it as it stands it goes once more without (SPIKE
// (reply-context): how MSG91 takes the quote is the adapter's to know, and unconfirmed). Only a plain refusal is tried again:
// an answer of "unsure" or "down" never is, so a message is sent at most once. The message then says it went without its quote.
import type { Logger } from "@travel-crm/integrations/logging";
import type { WhatsAppSendResult } from "@travel-crm/integrations/whatsapp";

export async function sendKeepingOrDroppingQuote(
  send: (withQuote: boolean) => Promise<WhatsAppSendResult | "file_missing">,
  quote: { quotes: boolean; replyTo: string | null; connectionId: string },
  logger: Logger,
): Promise<{ result: WhatsAppSendResult | "file_missing"; quoteDropped: boolean }> {
  // A quote of a message that has no WhatsApp id yet cannot be sent as one: it goes without, and says so.
  let quoteDropped = quote.quotes && quote.replyTo === null;
  const result = await send(true);
  if (result !== "file_missing" && !result.ok && result.reason === "other" && quote.replyTo !== null) {
    logger.info(
      { connectionId: quote.connectionId, providerCode: result.providerCode ?? null },
      "MSG91 refused a WhatsApp reply with its quote: sending it without",
    );
    quoteDropped = true;
    return { result: await send(false), quoteDropped };
  }
  return { result, quoteDropped };
}
