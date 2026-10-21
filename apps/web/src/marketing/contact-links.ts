// The links the public page offers for a contact: a call, a WhatsApp chat (wa.me takes the number without its "+",
// DESIGN.md section 9) and an email.
export const callLink = (e164: string): string => `tel:${e164}`;

export const whatsAppLink = (e164: string): string => `https://wa.me/${e164.replace(/^\+/, "")}`;

export const emailLink = (address: string): string => `mailto:${address}`;
