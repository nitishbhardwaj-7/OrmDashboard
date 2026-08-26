import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { DashboardSettings } from "../api/types";

export function SettingsPage() {
  const [settings, setSettings] = useState<DashboardSettings>({
    apifyApiUrl: "",
    apifyApiKey: "",
    aiApiUrl: "",
    aiApiKey: "",
    aiModel: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showApifyKey, setShowApifyKey] = useState(false);
  const [showAiKey, setShowAiKey] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    setLoading(true);
    setMessage(null);
    try {
      const data = await api.getSettings();
      setSettings(data);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to load dashboard settings." });
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await api.updateSettings(settings);
      setSettings(res.settings);
      setMessage({ type: "success", text: "Settings saved and applied successfully!" });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to save settings." });
    } finally {
      setSaving(false);
    }
  }

  function handleModelSelect(model: string) {
    setSettings((prev) => ({ ...prev, aiModel: model }));
  }

  if (loading) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-dim)" }}>
        <div className="spinner" style={{ width: 24, height: 24, borderLineWidth: 3 }} />
        <p style={{ marginTop: 12 }}>Loading configuration settings…</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 840 }}>
      <div className="page-header">
        <div>
          <h2>Dashboard Settings</h2>
          <p style={{ margin: "4px 0 0", color: "var(--text-dim)", fontSize: 13 }}>
            Configure integrations for Apify scraper data source and AI Sentiment Analysis engine.
          </p>
        </div>
      </div>

      {message && (
        <div className={`banner ${message.type === "error" ? "warn" : "info"}`} style={{ marginBottom: 20 }}>
          {message.type === "success" ? "✓ " : "⚠ "}
          {message.text}
        </div>
      )}

      {/* Integration Status Badges */}
      <div className="stat-grid" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 24 }}>
        <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Apify Scraper
            </div>
            <div style={{ fontWeight: 600, marginTop: 4, fontSize: 15 }}>
              {settings.apifyConfigured ? "Configured & Ready" : "Missing Credentials"}
            </div>
          </div>
          <span className={`badge ${settings.apifyConfigured ? "POSITIVE" : "NEGATIVE"}`}>
            {settings.apifyConfigured ? "Active" : "Incomplete"}
          </span>
        </div>

        <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.5 }}>
              AI Sentiment Engine
            </div>
            <div style={{ fontWeight: 600, marginTop: 4, fontSize: 15 }}>
              {settings.aiConfigured ? "Configured & Ready" : "Missing Credentials"}
            </div>
          </div>
          <span className={`badge ${settings.aiConfigured ? "POSITIVE" : "NEGATIVE"}`}>
            {settings.aiConfigured ? "Active" : "Incomplete"}
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* API / Apify Settings Card */}
        <div className="card settings-section">
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Apify Scraper Integration</h3>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
              Provide your Apify API Token and Actor/Task API endpoint URL.
            </span>
          </div>

          <div className="settings-form-group">
            <label htmlFor="apifyApiKey">API Key (Apify Token)</label>
            <div className="input-with-button">
              <input
                id="apifyApiKey"
                type={showApifyKey ? "text" : "password"}
                value={settings.apifyApiKey}
                onChange={(e) => setSettings({ ...settings, apifyApiKey: e.target.value })}
                placeholder="apify_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              />
              <button
                type="button"
                className="secondary"
                onClick={() => setShowApifyKey(!showApifyKey)}
                style={{ minWidth: 64 }}
              >
                {showApifyKey ? "Hide" : "Show"}
              </button>
            </div>
            <span className="field-hint">Your secret Apify API token used to authenticate actor runs.</span>
          </div>

          <div className="settings-form-group" style={{ marginTop: 16 }}>
            <label htmlFor="apifyApiUrl">API URL (Apify Endpoint)</label>
            <input
              id="apifyApiUrl"
              type="text"
              value={settings.apifyApiUrl}
              onChange={(e) => setSettings({ ...settings, apifyApiUrl: e.target.value })}
              placeholder="https://api.apify.com/v2/actors/your-actor-id/runs"
            />
            <span className="field-hint">The HTTP endpoint for initiating scrapes or fetching actor dataset items.</span>
          </div>
        </div>

        {/* AI Provider & Model Settings Card */}
        <div className="card settings-section">
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>AI Sentiment Model &amp; Key</h3>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
              Configure your LLM provider for sentiment analysis (Gemini / OpenAI API compatible).
            </span>
          </div>

          <div className="settings-form-group">
            <label htmlFor="aiModel">AI Model</label>
            <input
              id="aiModel"
              type="text"
              value={settings.aiModel}
              onChange={(e) => setSettings({ ...settings, aiModel: e.target.value })}
              placeholder="e.g. gemini-2.5-flash-lite"
            />
            <div className="preset-chips" style={{ marginTop: 8 }}>
              <span className="chip-label">Quick select:</span>
              {["gemini-2.5-flash-lite", "gemini-1.5-flash", "gpt-4o-mini"].map((model) => (
                <button
                  key={model}
                  type="button"
                  className={`preset-chip ${settings.aiModel === model ? "active" : ""}`}
                  onClick={() => handleModelSelect(model)}
                >
                  {model}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-form-group" style={{ marginTop: 16 }}>
            <label htmlFor="aiApiKey">AI API Key</label>
            <div className="input-with-button">
              <input
                id="aiApiKey"
                type={showAiKey ? "text" : "password"}
                value={settings.aiApiKey}
                onChange={(e) => setSettings({ ...settings, aiApiKey: e.target.value })}
                placeholder="Enter AI API Key"
              />
              <button
                type="button"
                className="secondary"
                onClick={() => setShowAiKey(!showAiKey)}
                style={{ minWidth: 64 }}
              >
                {showAiKey ? "Hide" : "Show"}
              </button>
            </div>
            <span className="field-hint">API key for Google Gemini or your custom OpenAI-compatible endpoint.</span>
          </div>

          <div className="settings-form-group" style={{ marginTop: 16 }}>
            <label htmlFor="aiApiUrl">AI API URL</label>
            <input
              id="aiApiUrl"
              type="text"
              value={settings.aiApiUrl}
              onChange={(e) => setSettings({ ...settings, aiApiUrl: e.target.value })}
              placeholder="https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
            />
            <span className="field-hint">Endpoint URL for OpenAI-compatible chat completions requests.</span>
          </div>
        </div>

        {/* Submit & Reset actions */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end" }}>
          <button type="button" className="secondary" onClick={fetchSettings} disabled={saving}>
            Reset Changes
          </button>
          <button type="submit" disabled={saving} style={{ minWidth: 140 }}>
            {saving ? (
              <>
                <span className="spinner" style={{ marginRight: 8 }} />
                Saving…
              </>
            ) : (
              "Save Settings"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
