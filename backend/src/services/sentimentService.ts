import { env, assertAiConfigured } from "../config/env";
import { SentimentLabel, SentimentResult } from "../types/normalized";

export class AiSentimentError extends Error {
  status?: number;
  rateLimited: boolean;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "AiSentimentError";
    this.status = status;
    this.rateLimited = status === 429;
  }
}

const SYSTEM_PROMPT = `You are a sentiment classification engine for social media monitoring.
Classify the sentiment of the given text as exactly one of: POSITIVE, NEGATIVE, NEUTRAL.

Judge sentiment from overall meaning and context, not from the presence of individual
"negative" or "positive" words in isolation. Handle negation, sarcasm cues, and mixed
statements sensibly. For example, "This phone is not bad at all" is POSITIVE (or NEUTRAL
at worst), not NEGATIVE, because the negation flips the word "bad". Similarly "not great"
leans NEGATIVE/NEUTRAL despite containing "great".

Respond with ONLY a compact JSON object, no prose, no markdown fences, in exactly this shape:
{"sentiment":"POSITIVE|NEGATIVE|NEUTRAL","confidence":0.0-1.0}
confidence is your calibrated confidence in the label, from 0 to 1.`;

/**
 * SentimentService — the ONLY module that talks to the AI provider. It is
 * intentionally decoupled from ApifyService/DataNormalizer: it just takes
 * plain text in and returns a sentiment label + confidence. Swapping AI
 * providers later means changing only this file (and AI_API_URL/AI_MODEL
 * in .env), never the Apify integration.
 *
 * Assumes an OpenAI-compatible /chat/completions endpoint. If your provider
 * differs, adjust `callChatCompletions` below — everything else stays the
 * same.
 */
export async function classifySentiment(text: string): Promise<SentimentResult> {
  assertAiConfigured();

  const trimmed = (text ?? "").trim();
  if (!trimmed) {
    throw new AiSentimentError("Cannot classify empty text.");
  }

  const raw = await callChatCompletions(trimmed);
  return parseModelOutput(raw);
}

async function callChatCompletions(text: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  let response: Response;
  try {
    response = await fetch(env.AI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.AI_MODEL,
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text.slice(0, 4000) },
        ],
      }),
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new AiSentimentError("AI sentiment request timed out.");
    }
    throw new AiSentimentError(`Could not reach AI API at the configured AI_API_URL: ${err?.message ?? err}`);
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 401 || response.status === 403) {
    throw new AiSentimentError("AI API rejected the request — check AI_API_KEY in Settings.", response.status);
  }
  if (response.status === 429) {
    throw new AiSentimentError("AI API rate limit exceeded. Try again later.", 429);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (response.status === 400 && (text.includes("API key") || text.includes("INVALID_ARGUMENT"))) {
      throw new AiSentimentError("AI API Key is invalid or unconfigured — please set a valid AI Key in Settings.", 400);
    }
    throw new AiSentimentError(`AI API request failed with status ${response.status}: ${text.slice(0, 500)}`, response.status);
  }

  const json: any = await response.json().catch(() => null);
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new AiSentimentError("AI API response did not contain the expected choices[0].message.content field.");
  }
  return content;
}

function parseModelOutput(raw: string): SentimentResult {
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Fall back to scanning for a label if the model didn't return clean JSON.
    const label = extractLabelFallback(cleaned);
    if (label) return { sentiment: label, confidence: null };
    throw new AiSentimentError("Could not parse sentiment from AI response.");
  }

  const label = normalizeLabel(parsed?.sentiment);
  if (!label) {
    throw new AiSentimentError(`AI response had an unrecognized sentiment value: ${JSON.stringify(parsed?.sentiment)}`);
  }

  let confidence: number | null = null;
  if (typeof parsed?.confidence === "number" && Number.isFinite(parsed.confidence)) {
    confidence = Math.max(0, Math.min(1, parsed.confidence));
  }

  return { sentiment: label, confidence };
}

function normalizeLabel(val: unknown): SentimentLabel | null {
  if (typeof val !== "string") return null;
  const upper = val.trim().toUpperCase();
  if (upper === "POSITIVE" || upper === "NEGATIVE" || upper === "NEUTRAL") return upper;
  return null;
}

function extractLabelFallback(text: string): SentimentLabel | null {
  const upper = text.toUpperCase();
  if (upper.includes("POSITIVE")) return "POSITIVE";
  if (upper.includes("NEGATIVE")) return "NEGATIVE";
  if (upper.includes("NEUTRAL")) return "NEUTRAL";
  return null;
}
