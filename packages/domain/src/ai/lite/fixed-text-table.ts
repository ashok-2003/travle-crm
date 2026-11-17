// The lite agent's fixed texts, as the owner approved them: money, payment and safety lines are code's words, never the
// model's. `{slots}` are filled by code. Change a line: raise the `fixed.texts` version in prompts/library.ts.
import type { LiteLanguage } from "@travel-crm/contracts/ai";
import type { FixedTextKey } from "./types.js";

export const fixedTextTable: Record<FixedTextKey, Record<LiteLanguage, string>> = {
  price_from: {
    english: "{package}: from {from} per person.",
    hindi: "{package}: {from} प्रति व्यक्ति से शुरू।",
    hinglish: "{package}: {from} per person se shuru.",
  },
  price_full: {
    english:
      "{package}, {date}: {perPerson} per person ({room}). For {travellers}, the total is {total}. Advance to book: {advance}.",
    hindi:
      "{package}, {date}: {perPerson} प्रति व्यक्ति ({room})। {travellers} के लिए कुल {total}। बुकिंग के लिए एडवांस: {advance}।",
    hinglish:
      "{package}, {date}: {perPerson} per person ({room}). {travellers} ke liye total {total}. Booking ke liye advance: {advance}.",
  },
  seats_left: {
    english: "Seats left on this date: {seats}.",
    hindi: "इस तारीख पर बची सीटें: {seats}।",
    hinglish: "Is date par bachi seats: {seats}.",
  },
  // The trip total sits beside the advance in both payment lines: a room that changed after the quote must show.
  book_payment: {
    english:
      "I've held seats for {travellers} on {package}, {date}, until {holdUntil}. To confirm, please pay the advance of {advance} and send the payment screenshot here. The trip total is {total}.",
    hindi:
      "{package}, {date} पर {travellers} के लिए सीटें {holdUntil} तक रोक ली गई हैं। पक्का करने के लिए कृपया {advance} का एडवांस भेजें (ट्रिप का कुल खर्च {total} है) और पेमेंट का स्क्रीनशॉट यहाँ भेज दें।",
    hinglish:
      "{package}, {date} par {travellers} ke liye seats {holdUntil} tak hold kar di gayi hain. Confirm karne ke liye please {advance} ka advance bhejein (trip ka kul kharch {total} hai) aur payment ka screenshot yahan bhej dein.",
  },
  book_payment_full: {
    english:
      "I've held seats for {travellers} on {package}, {date}, until {holdUntil}. To confirm, please pay the full amount of {total} and send the payment screenshot here.",
    hindi:
      "{package}, {date} पर {travellers} के लिए सीटें {holdUntil} तक रोक ली गई हैं। पक्का करने के लिए कृपया पूरी रकम {total} भेजें और पेमेंट का स्क्रीनशॉट यहाँ भेज दें।",
    hinglish:
      "{package}, {date} par {travellers} ke liye seats {holdUntil} tak hold kar di gayi hain. Confirm karne ke liye please poori amount {total} bhejein aur payment ka screenshot yahan bhej dein.",
  },
  payment_again: {
    english:
      "Here are the payment details again. Please pay {amount} and send the screenshot here. The trip total is {total}.",
    hindi:
      "पेमेंट की जानकारी फिर से भेज रहे हैं। कृपया {amount} भेजें (ट्रिप का कुल खर्च {total} है) और स्क्रीनशॉट यहाँ भेज दें।",
    hinglish:
      "Payment details phir se bhej rahe hain. Please {amount} bhejein (trip ka kul kharch {total} hai) aur screenshot yahan bhej dein.",
  },
  payment_heading: {
    english: "Payment details:",
    hindi: "पेमेंट की जानकारी:",
    hinglish: "Payment details:",
  },
  screenshot_received: {
    english: "Got your screenshot, thank you! I'll check it and confirm here shortly.",
    hindi: "स्क्रीनशॉट मिल गया, धन्यवाद! चेक करके यहीं कन्फ़र्म करते हैं।",
    hinglish: "Screenshot mil gaya, thank you! Check karke yahin confirm karte hain.",
  },
  ask_screenshot: {
    english: "Thank you! Please send the payment screenshot here, and I'll check it.",
    hindi: "धन्यवाद! कृपया पेमेंट का स्क्रीनशॉट यहाँ भेज दें, हम चेक कर लेंगे।",
    hinglish: "Payment ka screenshot yahan bhej dijiye, please.",
  },
  hand_over: {
    english: "Let me check this and get back to you here.",
    hindi: "एक मिनट, चेक करके यहीं बताते हैं।",
    hinglish: "Ek minute, check karke yahin batate hain.",
  },
  voice_note: {
    english: "I can't play voice notes here right now. I'll get back to you on this shortly.",
    hindi: "वॉइस नोट अभी यहाँ नहीं चल रहा। थोड़ी देर में यहीं जवाब देते हैं।",
    hinglish: "Voice note abhi yahan play nahi ho raha. Thodi der mein yahin reply karte hain.",
  },
  identity: {
    english: "I'm from the {agency} team. Tell me, how can I help with your trip?",
    hindi: "मैं {agency} की टीम से हूँ। बताइए, ट्रिप में कैसे मदद करूँ?",
    hinglish: "Main {agency} ki team se hoon. Bataiye, trip mein kaise help karoon?",
  },
  not_run: {
    english: "We don't run trips to {place} right now. Would you like to see the other trips we run?",
    hindi: "अभी हम {place} की ट्रिप नहीं कराते। क्या आप हमारी बाकी ट्रिप देखना चाहेंगे?",
    hinglish: "Abhi hum {place} ki trip nahi karate. Kya aap hamari baaki trips dekhna chahenge?",
  },
  close: {
    english: "No problem, thank you for letting us know. If you plan a trip later, just message us here.",
    hindi: "कोई बात नहीं, बताने के लिए धन्यवाद। आगे कभी ट्रिप का प्लान बने तो यहीं मैसेज कर दीजिए।",
    hinglish: "Koi baat nahi, batane ke liye thank you. Aage kabhi trip ka plan bane to yahin message kar dijiye.",
  },
  later: {
    english: "Sure, take your time. Message us here whenever you're ready.",
    hindi: "ज़रूर, आराम से सोच लीजिए। जब भी तैयार हों, यहीं मैसेज कर दीजिए।",
    hinglish: "Zaroor, aaram se soch lijiye. Jab bhi ready hon, yahin message kar dijiye.",
  },
  how_can_i_help: {
    english: "How can I help you with your trip?",
    hindi: "बताइए, ट्रिप के बारे में आप क्या जानना चाहेंगे?",
    hinglish: "Bataiye, trip ke baare mein aap kya jaanna chahenge?",
  },
};
