import { wordCount } from "./format";

const usd = (value: number) => `$${value.toFixed(value < 0.01 ? 5 : 3)} USD`;

export function estimateTranslationCost(text: string, model: string, language: "en" | "ur") {
  const prices: Record<string, { input: number; output: number }> = {
    "gemini-3.5-flash-lite": { input: 0.30, output: 2.50 },
  };
  const price = prices[model];
  if (!price) return `মডেল ${model || "(নির্বাচিত নয়)"}-এর মূল্যতথ্য নেই; নির্ভরযোগ্য USD অনুমান পাওয়া যায়নি।`;
  const chars = Array.from(text).length;
  const inputLow = chars * (language === "en" ? 0.22 : 0.35);
  const inputHigh = chars * (language === "en" ? 0.8 : 1.2);
  const outputLow = inputLow * 0.65;
  const outputHigh = inputHigh * 1.5;
  const low = (inputLow * price.input + outputLow * price.output) / 1_000_000;
  const high = (inputHigh * price.input + outputHigh * price.output) / 1_000_000;
  return `আনুমানিক ${usd(low)}–${usd(high)} (পেইড টিয়ার, টোকেনভিত্তিক পরিসর; Google-এর প্রকৃত বিল নয়)।`;
}

export function estimateTtsCost(text: string, model: string) {
  const prices: Record<string, { input: number; output: number }> = {
    "gemini-3.8-flash-tts": { input: 0.5, output: 9 },
    "gemini-3.8-flash-lite-tts": { input: 0.5, output: 6 },
  };
  const price = prices[model];
  if (!price) return `মডেল ${model || "(নির্বাচিত নয়)"}-এর মূল্যতথ্য নেই; নির্ভরযোগ্য USD অনুমান পাওয়া যায়নি।`;
  const chars = Array.from(text).length;
  const words = wordCount(text);
  const inputLow = chars * 0.35; const inputHigh = chars * 1.1;
  const audioTokensLow = words * 9; const audioTokensHigh = words * 16;
  const low = (inputLow * price.input + audioTokensLow * price.output) / 1_000_000;
  const high = (inputHigh * price.input + audioTokensHigh * price.output) / 1_000_000;
  return `আনুমানিক ${usd(low)}–${usd(high)} (পেইড টিয়ার; উচ্চারণের সময় ও টোকেন গণনা বদলায়, এটি Google-এর প্রকৃত বিল নয়)।`;
}
