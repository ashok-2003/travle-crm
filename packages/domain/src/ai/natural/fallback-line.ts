// The fallback line (spec 3.6, ruling 18): the natural agent's one fixed customer text, in the customer's language,
// picked by code since no model writes it: Hindi for Devanagari, Hinglish for a Hinglish word, else English.

/** Words a Hinglish line holds and an English one doesn't. */
const HINGLISH = new Set(
  [
    "hai hain kya kitna kitne kitni kab kaise kahan kaun kyun haan nahi nahin chahiye batao bataiye bataye",
    "mujhe humein hume karna karo kijiye aur theek thik accha acha achha chalega wala wali abhi mera meri",
    "aap aapka yaar ji",
  ]
    .join(" ")
    .split(" "),
);

const LINES = {
  hindi: "यह टीम से पूछकर यहीं बताते हैं।",
  hinglish: "Ye team se check karke yahin batate hain.",
  english: "Let me check this with the team; they'll reply here.",
};

/** The line for the customer's new lines. */
export function fallbackLine(customerText: string): string {
  if (/[\u0900-\u097F]/u.test(customerText)) return LINES.hindi;
  const words = customerText.toLowerCase().match(/\p{L}+/gu) ?? [];
  return words.some((word) => HINGLISH.has(word)) ? LINES.hinglish : LINES.english;
}
