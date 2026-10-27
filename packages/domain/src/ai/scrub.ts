// Chat words made safe to send for learning (the AI sales agent): long numbers, emails and links taken out, so a lesson
// or a way of talking never carries someone's phone, address or account.
export const scrubbed = (text: string) =>
  text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
    .replace(/https?:\/\/\S+/g, "[link]")
    .replace(/\+?\d[\d\s-]{6,}\d/g, "[number]");
