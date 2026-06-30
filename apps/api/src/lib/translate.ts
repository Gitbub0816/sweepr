/**
 * Translation helper using Claude claude-haiku-4-5-20251001 via the Anthropic Messages API.
 * Used for:
 *   - Translating admin broadcast emails into recipients' preferred languages
 *   - On-demand translation of inbound emails in the admin console
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

/**
 * Translate `text` into the target language using Claude Haiku.
 * Returns the translated text, or the original on failure.
 * Never translates "Sweepr" or "ClearKey Solutions".
 */
export async function translateText(
  apiKey: string,
  text: string,
  targetLang: string,
): Promise<string> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `Translate the following text into ${targetLang}. Rules:
- Output ONLY the translated text, no explanations or quotes.
- Never translate proper nouns "Sweepr" or "ClearKey Solutions" — keep them exactly as-is.
- Preserve all line breaks, punctuation, and formatting.

Text to translate:
${text}`,
        },
      ],
    }),
  });

  if (!res.ok) return text;

  const data = (await res.json()) as {
    content?: Array<{ type: string; text: string }>;
  };
  return data.content?.[0]?.text?.trim() ?? text;
}

/**
 * Translate text to English for admin viewing.
 * If text appears to already be English, returns it unchanged.
 */
export async function translateToEnglish(
  apiKey: string,
  text: string,
): Promise<string> {
  return translateText(apiKey, text, "English");
}

const LANG_NAMES: Record<string, string> = {
  es: "Spanish",
  vi: "Vietnamese",
  "zh-Hans": "Simplified Chinese",
  "zh-Hant": "Traditional Chinese",
  fil: "Filipino (Tagalog)",
  ko: "Korean",
  ar: "Arabic",
  pt: "Portuguese",
  hi: "Hindi",
};

export function langName(code: string): string {
  return LANG_NAMES[code] ?? code;
}
