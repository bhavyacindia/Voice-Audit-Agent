export type ReplyLanguage = "en" | "hi";

// Deepgram may return Hindi in Devanagari or in English letters.
const hindiWords = /\b(mera|meri|mere|main|mai|mein|mujhe|mujhko|aap|aapka|aapki|kya|hai|hain|hoon|hu|nahi|nahin|haan|han|kyunki|kaise|kahan|kab|hoga|hua|hui|gaya|gayi|karna|karo|chahiye|batao|bataye|ki|se)\b/i;

export function chooseReplyLanguage(transcript: string, previous: ReplyLanguage): ReplyLanguage {
  if (/\p{Script=Devanagari}/u.test(transcript) || hindiWords.test(transcript)) return "hi";
  // A short "yes" or "no" should not change the language of the conversation.
  if (transcript.trim().split(/\s+/).length >= 3) return "en";
  return previous;
}
