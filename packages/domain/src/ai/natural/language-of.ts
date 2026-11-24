// The customer's language by their words (a button tap's fixed line follows it): Hindi for Devanagari, Hinglish for a
// Hinglish word, else English.

/** Words a Hinglish line holds and an English one doesn't. */
const HINGLISH = new Set(
  [
    "hai hain kya kitna kitne kitni kab kaise kahan kaun kyun haan nahi nahin chahiye batao bataiye bataye",
    "mujhe humein hume karna karo kijiye aur theek thik accha acha achha chalega wala wali abhi mera meri",
    "aap aapka yaar ji bhejo bhej",
  ]
    .join(" ")
    .split(" "),
);
/** Hinglish particles count only in lower case: "Ko Samui" and "Ki Monastery" are places. */
const PARTICLES = new Set(["ka", "ki", "ke", "ko", "se"]);

/** The customer's language by their words: Hindi for Devanagari, Hinglish for a Hinglish word, else English. */
export function languageOf(text: string): "hindi" | "hinglish" | "english" {
  if (/[\u0900-\u097F]/u.test(text)) return "hindi";
  const words = text.match(/\p{L}+/gu) ?? [];
  return words.some((word) => HINGLISH.has(word.toLowerCase()) || PARTICLES.has(word)) ? "hinglish" : "english";
}
