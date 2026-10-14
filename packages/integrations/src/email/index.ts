// Public API of @travel-crm/integrations/email: the email port, its adapters and the product's email layout.
export { assertSafeHeaders, type EmailMessage, type EmailSender } from "./email-sender.js";
export { createMemoryEmailSender, type MemoryEmailSender } from "./memory-email-sender.js";
export { renderEmail, type EmailContent } from "./render-email.js";
export { senderNameFor } from "./sender-name.js";
export { createSmtpEmailSender, type SmtpSettings } from "./smtp-email-sender.js";
