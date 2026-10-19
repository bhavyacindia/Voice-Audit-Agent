export const replyLanguages = {
  en: "English",
  hi: "Hindi",
  bn: "Bengali",
  gu: "Gujarati",
  kn: "Kannada",
  ml: "Malayalam",
  mr: "Marathi",
  or: "Odia",
  pa: "Punjabi",
  ta: "Tamil",
  te: "Telugu",
  ur: "Urdu",
} as const;

export type ReplyLanguage = keyof typeof replyLanguages;

const supportedLanguageCodes = new Set<string>(Object.keys(replyLanguages));

const waitFillers: Record<ReplyLanguage, string[]> = {
  en: [
    "One moment.",
    "Just a moment.",
    "Give me a second.",
    "Let me check that for you.",
    "Let me think for a moment.",
    "I'm checking that now.",
    "I'll get back to you in a second.",
    "Let me look into that.",
    "Thanks, give me a moment.",
    "I'll take a quick moment.",
    "Let me process that.",
    "Give me just a moment, please.",
    "I'll be right with you.",
    "Let me gather my thoughts.",
    "I'm working on that now.",
    "Let me review that for a moment.",
    "I'll check that quickly.",
    "Bear with me for a second.",
    "Let me make sure I understand.",
    "I'll take a moment to respond.",
    "Just a second while I check.",
    "Let me consider that carefully.",
    "I'm putting that together now.",
    "I'll respond in just a moment.",
    "Let me take a quick look.",
    "Hmm, one moment.",
    "Hmm, let me think.",
    "Okay, give me a second.",
  ],
  hi: [
    "एक पल दीजिए।",
    "बस एक क्षण।",
    "मुझे एक पल दीजिए।",
    "मैं अभी देखता हूँ।",
    "मैं अभी जाँच करता हूँ।",
    "एक सेकंड रुकिए।",
    "मैं इस पर ध्यान दे रहा हूँ।",
    "मुझे ज़रा सोचने दीजिए।",
    "मैं अभी जवाब देता हूँ।",
    "कृपया एक पल रुकिए।",
    "मैं इसे समझ रहा हूँ।",
    "बस अभी बताता हूँ।",
    "हम्म, एक पल।",
    "अच्छा, एक क्षण।",
    "हम्म, मुझे सोचने दीजिए।",
  ],
  mr: [
    "एक क्षण द्या.",
    "जरा थांबा.",
    "मला एक क्षण द्या.",
    "मी आत्ताच तपासतो.",
    "मी याबद्दल विचार करतो.",
    "कृपया क्षणभर थांबा.",
    "मी हे समजून घेतो.",
    "मी लगेच उत्तर देतो.",
    "मला जरा पाहू द्या.",
    "मी यावर लक्ष देतो.",
    "फक्त एक सेकंद.",
    "मी आत्ताच सांगतो.",
    "हं, एक क्षण.",
    "बरं, जरा थांबा.",
    "मला जरा विचार करू द्या.",
  ],
  bn: [
    "একটু সময় দিন।", "এক মুহূর্ত অপেক্ষা করুন।", "আমি বিষয়টি দেখছি।",
    "এক সেকেন্ড দিন।", "আমি একটু ভেবে নিচ্ছি।", "আমি এখনই জানাচ্ছি।",
    "দয়া করে একটু অপেক্ষা করুন।", "আমি বিষয়টি বুঝে নিচ্ছি।",
    "আমাকে একটু দেখতে দিন।", "আমি এখনই উত্তর দিচ্ছি।",
  ],
  gu: [
    "એક ક્ષણ આપશો.", "જરા થોભો.", "હું હમણાં તપાસું છું.",
    "મને એક સેકન્ડ આપો.", "હું આ સમજી રહ્યો છું.", "હું હમણાં જવાબ આપું છું.",
    "કૃપા કરીને થોડી રાહ જુઓ.", "મને જરા જોવા દો.",
    "હું આ વિશે વિચારી રહ્યો છું.", "હમણાં જ કહું છું.",
  ],
  kn: [
    "ಒಂದು ಕ್ಷಣ ಕೊಡಿ.", "ದಯವಿಟ್ಟು ಸ್ವಲ್ಪ ಕಾಯಿರಿ.", "ನಾನು ಈಗ ಪರಿಶೀಲಿಸುತ್ತೇನೆ.",
    "ಒಂದು ಸೆಕೆಂಡ್ ಕೊಡಿ.", "ನಾನು ಇದನ್ನು ಅರ್ಥಮಾಡಿಕೊಳ್ಳುತ್ತಿದ್ದೇನೆ.", "ಈಗಲೇ ಉತ್ತರಿಸುತ್ತೇನೆ.",
    "ಸ್ವಲ್ಪ ಯೋಚಿಸಲು ಬಿಡಿ.", "ನಾನು ಇದನ್ನು ನೋಡುತ್ತಿದ್ದೇನೆ.",
    "ದಯವಿಟ್ಟು ಕ್ಷಣಕಾಲ ಕಾಯಿರಿ.", "ನಾನು ಈಗಲೇ ತಿಳಿಸುತ್ತೇನೆ.",
  ],
  ml: [
    "ഒരു നിമിഷം തരൂ.", "ദയവായി അല്പം കാത്തിരിക്കൂ.", "ഞാൻ ഇപ്പോൾ പരിശോധിക്കാം.",
    "ഒരു സെക്കൻഡ് തരൂ.", "ഞാൻ ഇത് മനസ്സിലാക്കുകയാണ്.", "ഞാൻ ഉടൻ മറുപടി പറയാം.",
    "ഒന്ന് ആലോചിക്കട്ടെ.", "ഞാൻ ഇത് നോക്കുകയാണ്.",
    "ദയവായി ഒരു നിമിഷം കാത്തിരിക്കൂ.", "ഞാൻ ഇപ്പോൾ പറയാം.",
  ],
  or: [
    "ମୋତେ ଏକ ମୁହୂର୍ତ୍ତ ଦିଅନ୍ତୁ।", "ଦୟାକରି ଟିକେ ଅପେକ୍ଷା କରନ୍ତୁ।",
    "ମୁଁ ଏବେ ଯାଞ୍ଚ କରୁଛି।", "ମୋତେ ଗୋଟିଏ ସେକେଣ୍ଡ ଦିଅନ୍ତୁ।",
    "ମୁଁ ଏହା ବୁଝୁଛି।", "ମୁଁ ଏବେ ଉତ୍ତର ଦେଉଛି।",
    "ଟିକେ ଭାବିବାକୁ ଦିଅନ୍ତୁ।", "ମୁଁ ଏହା ଦେଖୁଛି।",
    "ଦୟାକରି କ୍ଷଣେ ଅପେକ୍ଷା କରନ୍ତୁ।", "ମୁଁ ଏବେ କହୁଛି।",
  ],
  pa: [
    "ਇੱਕ ਪਲ ਦਿਓ ਜੀ।", "ਜ਼ਰਾ ਰੁਕੋ ਜੀ।", "ਮੈਂ ਹੁਣੇ ਜਾਂਚਦਾ ਹਾਂ।",
    "ਮੈਨੂੰ ਇੱਕ ਸਕਿੰਟ ਦਿਓ।", "ਮੈਂ ਇਹ ਸਮਝ ਰਿਹਾ ਹਾਂ।", "ਮੈਂ ਹੁਣੇ ਜਵਾਬ ਦਿੰਦਾ ਹਾਂ।",
    "ਕਿਰਪਾ ਕਰਕੇ ਥੋੜ੍ਹਾ ਇੰਤਜ਼ਾਰ ਕਰੋ।", "ਮੈਨੂੰ ਜ਼ਰਾ ਦੇਖਣ ਦਿਓ।",
    "ਮੈਂ ਇਸ ਬਾਰੇ ਸੋਚ ਰਿਹਾ ਹਾਂ।", "ਬਸ ਹੁਣੇ ਦੱਸਦਾ ਹਾਂ।",
  ],
  ta: [
    "ஒரு நிமிடம் கொடுங்கள்.", "தயவுசெய்து சற்று காத்திருங்கள்.", "நான் இப்போது சரிபார்க்கிறேன்.",
    "ஒரு நொடி கொடுங்கள்.", "நான் இதைப் புரிந்துகொள்கிறேன்.", "உடனே பதில் சொல்கிறேன்.",
    "சற்று யோசிக்க விடுங்கள்.", "நான் இதைப் பார்க்கிறேன்.",
    "தயவுசெய்து ஒரு கணம் காத்திருங்கள்.", "இப்போதே சொல்கிறேன்.",
  ],
  te: [
    "ఒక్క క్షణం ఇవ్వండి.", "దయచేసి కొంచెం వేచి ఉండండి.", "నేను ఇప్పుడే పరిశీలిస్తాను.",
    "ఒక సెకను ఇవ్వండి.", "నేను దీన్ని అర్థం చేసుకుంటున్నాను.", "వెంటనే సమాధానం చెబుతాను.",
    "కొంచెం ఆలోచించనివ్వండి.", "నేను దీన్ని చూస్తున్నాను.",
    "దయచేసి ఒక్క నిమిషం వేచి ఉండండి.", "ఇప్పుడే చెబుతాను.",
  ],
  ur: [
    "ایک لمحہ دیجیے۔", "ذرا انتظار کیجیے۔", "میں ابھی دیکھتا ہوں۔",
    "مجھے ایک سیکنڈ دیجیے۔", "میں اسے سمجھ رہا ہوں۔", "میں ابھی جواب دیتا ہوں۔",
    "مجھے ذرا سوچنے دیجیے۔", "میں ابھی جانچتا ہوں۔",
    "براہِ کرم ایک لمحہ انتظار کریں۔", "میں ابھی بتاتا ہوں۔",
  ],
};

export function pickWaitFiller(language: ReplyLanguage, previous = "") {
  const choices = waitFillers[language].filter((filler) => filler !== previous);
  const pool = choices.length ? choices : waitFillers[language];
  return pool[Math.floor(Math.random() * pool.length)]!;
}

// Deepgram may return Hindi in Devanagari or in English letters.
const hindiWords = /\b(mera|meri|mere|main|mai|mein|mujhe|mujhko|aap|aapka|aapki|kya|hai|hain|hoon|hu|nahi|nahin|haan|han|kyunki|kaise|kahan|kab|hoga|hua|hui|gaya|gayi|karna|karo|chahiye|batao|bataye|ki|se)\b/i;

export function chooseReplyLanguage(
  transcript: string,
  previous: ReplyLanguage,
  detectedLanguage?: string | null,
  configuredLanguage?: string,
): ReplyLanguage {
  const detected = detectedLanguage?.split("-")[0]?.toLowerCase();
  if (detected && supportedLanguageCodes.has(detected)) return detected as ReplyLanguage;
  const configured = configuredLanguage?.split("-")[0]?.toLowerCase();
  if (configured && configured !== "multi" && supportedLanguageCodes.has(configured)) {
    return configured as ReplyLanguage;
  }
  if (/\p{Script=Devanagari}/u.test(transcript) || hindiWords.test(transcript)) return "hi";
  if (/\p{Script=Bengali}/u.test(transcript)) return "bn";
  if (/\p{Script=Gujarati}/u.test(transcript)) return "gu";
  if (/\p{Script=Kannada}/u.test(transcript)) return "kn";
  if (/\p{Script=Malayalam}/u.test(transcript)) return "ml";
  if (/\p{Script=Gurmukhi}/u.test(transcript)) return "pa";
  if (/\p{Script=Oriya}/u.test(transcript)) return "or";
  if (/\p{Script=Tamil}/u.test(transcript)) return "ta";
  if (/\p{Script=Telugu}/u.test(transcript)) return "te";
  if (/\p{Script=Arabic}/u.test(transcript)) return "ur";
  // A short "yes" or "no" should not change the language of the conversation.
  if (transcript.trim().split(/\s+/).length >= 3) return "en";
  return previous;
}
