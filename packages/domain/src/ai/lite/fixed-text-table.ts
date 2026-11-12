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
      "I've held seats for {travellers} on {package}, {date}, until {holdUntil}. To confirm, please pay the advance of {advance} (the trip total is {total}) and send the payment screenshot here.",
    hindi:
      "{package}, {date} पर {travellers} के लिए सीटें {holdUntil} तक रोक ली गई हैं। पक्का करने के लिए कृपया {advance} का एडवांस भेजें (ट्रिप का कुल {total} है) और पेमेंट का स्क्रीनशॉट यहाँ भेज दें।",
    hinglish:
      "{package}, {date} par {travellers} ke liye seats {holdUntil} tak hold kar di gayi hain. Confirm karne ke liye please {advance} ka advance bhejein (trip ka total {total} hai) aur payment ka screenshot yahan bhej dein.",
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
      "Here are the payment details again. Please pay {amount} (the trip total is {total}) and send the screenshot here.",
    hindi:
      "पेमेंट की जानकारी फिर से भेज रहे हैं। कृपया {amount} भेजें (ट्रिप का कुल {total} है) और स्क्रीनशॉट यहाँ भेज दें।",
    hinglish:
      "Payment details phir se bhej rahe hain. Please {amount} bhejein (trip ka total {total} hai) aur screenshot yahan bhej dein.",
  },
  payment_heading: {
    english: "Payment details:",
    hindi: "पेमेंट की जानकारी:",
    hinglish: "Payment details:",
  },
  screenshot_received: {
    english: "Got your screenshot, the team will confirm shortly.",
    hindi: "आपका स्क्रीनशॉट मिल गया है, टीम जल्द ही कन्फ़र्म करेगी।",
    hinglish: "Aapka screenshot mil gaya hai, team jaldi confirm karegi.",
  },
  ask_screenshot: {
    english: "Thank you! Please send the payment screenshot here, and the team will check it.",
    hindi: "धन्यवाद! कृपया पेमेंट का स्क्रीनशॉट यहाँ भेज दें, टीम उसे चेक कर लेगी।",
    hinglish: "Thank you! Please payment ka screenshot yahan bhej dein, team use check kar legi.",
  },
  hand_over: {
    english: "Someone from the team will help you with this. They'll reply here.",
    hindi: "इसमें टीम से कोई आपकी मदद करेगा। वे यहीं जवाब देंगे।",
    hinglish: "Isme team se koi aapki help karega. Woh yahin reply karenge.",
  },
  voice_note: {
    english: "I can't listen to voice notes yet; someone from the team will reply.",
    hindi: "अभी वॉइस नोट सुनने की सुविधा नहीं है; टीम से कोई आपको जवाब देगा।",
    hinglish: "Abhi voice note sunne ki suvidha nahi hai; team se koi aapko reply karega.",
  },
  identity: {
    english: "I'm {agency}'s assistant on WhatsApp. Someone from the team can join any time.",
    hindi: "मैं WhatsApp पर {agency} का असिस्टेंट हूँ। टीम से कोई भी कभी भी जुड़ सकता है।",
    hinglish: "Main WhatsApp par {agency} ka assistant hoon. Team se koi bhi kabhi bhi join kar sakta hai.",
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
