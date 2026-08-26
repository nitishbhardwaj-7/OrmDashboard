import dotenv from "dotenv";
import path from "path";
import fs from "fs";

const envPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: envPath });

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  PORT: Number(optional("PORT", "4000")),
  CORS_ORIGIN: optional("CORS_ORIGIN", "http://localhost:5173"),

  APIFY_API_URL: optional("APIFY_API_URL"),
  APIFY_API_KEY: optional("APIFY_API_KEY") || optional("APIFY_API_URL").match(/[?&]token=([^&]+)/)?.[1] || "",
  APIFY_METHOD: (optional("APIFY_METHOD", "POST").toUpperCase() as "GET" | "POST"),
  APIFY_INPUT_TEMPLATE: optional("APIFY_INPUT_TEMPLATE", '{"searches":["{{keyword}}"]}'),
  APIFY_QUERY_PARAMS: optional("APIFY_QUERY_PARAMS"),
  APIFY_TIMEOUT_MS: Number(optional("APIFY_TIMEOUT_MS", "120000")),

  AI_API_URL: optional("AI_API_URL"),
  AI_API_KEY: optional("AI_API_KEY"),
  AI_MODEL: optional("AI_MODEL", "gemini-2.5-flash-lite"),
  AI_CONCURRENCY: Number(optional("AI_CONCURRENCY", "3")),
};

export function getSettings() {
  return {
    apifyApiUrl: env.APIFY_API_URL,
    apifyApiKey: env.APIFY_API_KEY,
    aiApiUrl: env.AI_API_URL,
    aiApiKey: env.AI_API_KEY,
    aiModel: env.AI_MODEL,
    apifyConfigured: Boolean(env.APIFY_API_URL && env.APIFY_API_KEY),
    aiConfigured: Boolean(env.AI_API_URL && env.AI_API_KEY),
  };
}

export interface SettingsUpdatePayload {
  apifyApiUrl?: string;
  apifyApiKey?: string;
  aiApiUrl?: string;
  aiApiKey?: string;
  aiModel?: string;
}

export function updateSettings(updates: SettingsUpdatePayload) {
  if (updates.apifyApiUrl !== undefined) {
    env.APIFY_API_URL = updates.apifyApiUrl.trim();
    process.env.APIFY_API_URL = env.APIFY_API_URL;
  }
  if (updates.apifyApiKey !== undefined) {
    env.APIFY_API_KEY = updates.apifyApiKey.trim();
    process.env.APIFY_API_KEY = env.APIFY_API_KEY;
  }
  if (updates.aiApiUrl !== undefined) {
    env.AI_API_URL = updates.aiApiUrl.trim();
    process.env.AI_API_URL = env.AI_API_URL;
  }
  if (updates.aiApiKey !== undefined) {
    env.AI_API_KEY = updates.aiApiKey.trim();
    process.env.AI_API_KEY = env.AI_API_KEY;
  }
  if (updates.aiModel !== undefined) {
    env.AI_MODEL = updates.aiModel.trim();
    process.env.AI_MODEL = env.AI_MODEL;
  }

  // Also auto-extract token if user set APIFY_API_URL with token param and APIFY_API_KEY is empty
  if (env.APIFY_API_URL && !env.APIFY_API_KEY) {
    const extractedToken = env.APIFY_API_URL.match(/[?&]token=([^&]+)/)?.[1];
    if (extractedToken) {
      env.APIFY_API_KEY = extractedToken;
      process.env.APIFY_API_KEY = extractedToken;
    }
  }

  persistToEnvFile({
    APIFY_API_URL: env.APIFY_API_URL,
    APIFY_API_KEY: env.APIFY_API_KEY,
    AI_API_URL: env.AI_API_URL,
    AI_API_KEY: env.AI_API_KEY,
    AI_MODEL: env.AI_MODEL,
  });

  return getSettings();
}

function persistToEnvFile(map: Record<string, string>) {
  try {
    let content = "";
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, "utf-8");
    }

    const lines = content.split(/\r?\n/);
    const updatedKeys = new Set<string>();

    const newLines = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;
      const eqIndex = line.indexOf("=");
      if (eqIndex === -1) return line;

      const key = line.slice(0, eqIndex).trim();
      if (key in map) {
        updatedKeys.add(key);
        return `${key}=${map[key]}`;
      }
      return line;
    });

    Object.entries(map).forEach(([key, val]) => {
      if (!updatedKeys.has(key)) {
        newLines.push(`${key}=${val}`);
      }
    });

    fs.writeFileSync(envPath, newLines.join("\n"), "utf-8");
  } catch (err) {
    console.error("Failed to update .env file:", err);
  }
}

// Note: we deliberately do NOT throw on missing Apify/AI config at import
// time. The server should still boot (health check, dashboard on existing
// data) even before credentials are configured; individual calls that need
// them will surface a clear, actionable error instead.
export function assertApifyConfigured() {
  if (!env.APIFY_API_URL || !env.APIFY_API_KEY) {
    throw new ConfigError(
      "Apify is not configured. Set APIFY_API_URL and APIFY_API_KEY in dashboard settings or backend/.env."
    );
  }
}

export function assertAiConfigured() {
  if (!env.AI_API_URL || !env.AI_API_KEY) {
    throw new ConfigError(
      "AI sentiment provider is not configured. Set AI_API_URL, AI_API_KEY and AI_MODEL in dashboard settings or backend/.env."
    );
  }
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

