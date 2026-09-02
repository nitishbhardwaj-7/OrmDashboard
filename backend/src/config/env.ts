import dotenv from "dotenv";
import path from "path";
import fs from "fs";

const envPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: envPath });

const DEFAULT_DATABASE_URL =
  "postgresql://neondb_owner:npg_V5BenYtrj7LE@ep-shy-star-a5pnqlsg-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

function getDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw || raw.trim().startsWith("file:")) {
    return DEFAULT_DATABASE_URL;
  }
  return raw.trim();
}

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

  AI_API_URL: optional("AI_API_URL", "https://api.mistral.ai/v1/chat/completions"),
  AI_API_KEY: optional("AI_API_KEY") || optional("MISTRAL_API_KEY"),
  AI_MODEL: optional("AI_MODEL", "mistral-small-latest"),
  AI_CONCURRENCY: Number(optional("AI_CONCURRENCY", "3")),

  RESEND_API_KEY: optional("RESEND_API_KEY"),
  ALERT_EMAIL: optional("ALERT_EMAIL", "delivered@resend.dev"),

  SERPER_API_KEY: optional("SERPER_API_KEY") || optional("SEARCHAPI_KEY"),
  SEARCHAPI_KEY: optional("SEARCHAPI_KEY") || optional("SERPER_API_KEY"),
  MONGODB_URI: optional("MONGODB_URI"),
  MONGODB_DB: optional("MONGODB_DB", "brandmonitor"),
  DATABASE_URL: getDatabaseUrl(),
};

export function getSettings() {
  const serperKey = env.SERPER_API_KEY || env.SEARCHAPI_KEY;
  return {
    apifyApiUrl: env.APIFY_API_URL,
    apifyApiKey: env.APIFY_API_KEY,
    aiApiUrl: env.AI_API_URL,
    aiApiKey: env.AI_API_KEY,
    aiModel: env.AI_MODEL,
    resendApiKey: env.RESEND_API_KEY,
    alertEmail: env.ALERT_EMAIL,
    searchApiKey: serperKey,
    serperApiKey: serperKey,
    mongodbUri: env.MONGODB_URI,
    mongodbDb: env.MONGODB_DB,
    databaseUrl: env.DATABASE_URL,
    apifyConfigured: Boolean(env.APIFY_API_URL && env.APIFY_API_KEY),
    aiConfigured: Boolean(env.AI_API_URL && env.AI_API_KEY),
    resendConfigured: Boolean(env.RESEND_API_KEY),
    searchApiConfigured: Boolean(serperKey),
    serperApiConfigured: Boolean(serperKey),
    databaseConfigured: Boolean(env.DATABASE_URL),
  };
}

export interface SettingsUpdatePayload {
  apifyApiUrl?: string;
  apifyApiKey?: string;
  aiApiUrl?: string;
  aiApiKey?: string;
  aiModel?: string;
  resendApiKey?: string;
  alertEmail?: string;
  searchApiKey?: string;
  serperApiKey?: string;
  mongodbUri?: string;
  mongodbDb?: string;
  databaseUrl?: string;
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
  if (updates.resendApiKey !== undefined) {
    env.RESEND_API_KEY = updates.resendApiKey.trim();
    process.env.RESEND_API_KEY = env.RESEND_API_KEY;
  }
  if (updates.alertEmail !== undefined) {
    env.ALERT_EMAIL = updates.alertEmail.trim();
    process.env.ALERT_EMAIL = env.ALERT_EMAIL;
  }
  const newSerperKey = updates.serperApiKey !== undefined ? updates.serperApiKey.trim() : (updates.searchApiKey !== undefined ? updates.searchApiKey.trim() : undefined);
  if (newSerperKey !== undefined) {
    env.SERPER_API_KEY = newSerperKey;
    env.SEARCHAPI_KEY = newSerperKey;
    process.env.SERPER_API_KEY = newSerperKey;
    process.env.SEARCHAPI_KEY = newSerperKey;
  }
  if (updates.mongodbUri !== undefined) {
    env.MONGODB_URI = updates.mongodbUri.trim();
    process.env.MONGODB_URI = env.MONGODB_URI;
  }
  if (updates.mongodbDb !== undefined) {
    env.MONGODB_DB = updates.mongodbDb.trim();
    process.env.MONGODB_DB = env.MONGODB_DB;
  }
  if (updates.databaseUrl !== undefined) {
    env.DATABASE_URL = updates.databaseUrl.trim();
    process.env.DATABASE_URL = env.DATABASE_URL;
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
    RESEND_API_KEY: env.RESEND_API_KEY,
    ALERT_EMAIL: env.ALERT_EMAIL,
    SERPER_API_KEY: env.SERPER_API_KEY,
    SEARCHAPI_KEY: env.SEARCHAPI_KEY,
    MONGODB_URI: env.MONGODB_URI,
    MONGODB_DB: env.MONGODB_DB,
    DATABASE_URL: env.DATABASE_URL,
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
