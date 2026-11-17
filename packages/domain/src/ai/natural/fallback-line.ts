// The fallback line (spec 3.6, ruling 18): the natural agent's one fixed customer text, in the customer's language,
// picked by code since no model writes it: Hindi for Devanagari, Hinglish for a Hinglish word, else English.

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

const LINES = {
  hindi: "एक मिनट, चेक करके यहीं बताते हैं।",
  hinglish: "Ek minute, check karke yahin batate hain.",
  english: "Let me check this and get back to you here.",
};

/** The line for the customer's new lines. */
export function fallbackLine(customerText: string): string {
  if (/[\u0900-\u097F]/u.test(customerText)) return LINES.hindi;
  const words = customerText.match(/\p{L}+/gu) ?? [];
  const hinglish = words.some((word) => HINGLISH.has(word.toLowerCase()) || PARTICLES.has(word));
  return hinglish ? LINES.hinglish : LINES.english;
}
