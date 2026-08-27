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
    resendApiKey: "",
    alertEmail: "delivered@resend.dev",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resettingDb, setResettingDb] = useState(false);
  const [showApifyKey, setShowApifyKey] = useState(false);
  const [showAiKey, setShowAiKey] = useState(false);
  const [showResendKey, setShowResendKey] = useState(false);
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

  async function handleResetDatabase() {
    const confirmed = window.confirm(
      "⚠ Are you sure you want to permanently delete ALL posts, comments, scrape runs, and keywords from the database? This action cannot be undone."
    );
    if (!confirmed) return;

    setResettingDb(true);
    setMessage(null);
    try {
      const res = await api.resetDatabase();
      setMessage({
        type: "success",
        text: `✓ Database emptied successfully! Purged ${res.deletedPosts} posts, ${res.deletedComments} comments, and ${res.deletedKeywords} keywords.`,
      });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to empty database." });
    } finally {
      setResettingDb(false);
    }
  }

  function handleModelSelect(model: string) {
    setSettings((prev) => ({ ...prev, aiModel: model }));
  }

  if (loading) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-dim)" }}>
        <div className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
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
            Configure integrations for Apify scraper data source, AI Sentiment engine, Resend email alerts, and database management.
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
      <div className="stat-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 24 }}>
        <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Apify Scraper
            </div>
            <div style={{ fontWeight: 600, marginTop: 4, fontSize: 14 }}>
              {settings.apifyConfigured ? "Ready" : "Incomplete"}
            </div>
          </div>
          <span className={`badge ${settings.apifyConfigured ? "POSITIVE" : "NEGATIVE"}`}>
            {settings.apifyConfigured ? "Active" : "Off"}
          </span>
        </div>

        <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.5 }}>
              AI Sentiment Engine
            </div>
            <div style={{ fontWeight: 600, marginTop: 4, fontSize: 14 }}>
              {settings.aiConfigured ? "Ready" : "Incomplete"}
            </div>
          </div>
          <span className={`badge ${settings.aiConfigured ? "POSITIVE" : "NEGATIVE"}`}>
            {settings.aiConfigured ? "Active" : "Off"}
          </span>
        </div>

        <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Email Alerts (Resend)
            </div>
            <div style={{ fontWeight: 600, marginTop: 4, fontSize: 14 }}>
              {settings.resendConfigured ? "Active" : "Disabled"}
            </div>
          </div>
          <span className={`badge ${settings.resendConfigured ? "POSITIVE" : "NEUTRAL"}`}>
            {settings.resendConfigured ? "Active" : "Off"}
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Resend Email Alerts Card */}
        <div className="card settings-section" style={{ border: "1px solid rgba(220, 38, 38, 0.4)", background: "rgba(220, 38, 38, 0.03)" }}>
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, color: "#f87171" }}>🚨 Instant Negative Alert Email Notifications</h3>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
              Sends an immediate email notification via Resend whenever a NEW negative post or comment is discovered.
            </span>
          </div>

          <div className="settings-form-group">
            <label htmlFor="resendApiKey">Resend API Key</label>
            <div className="input-with-button">
              <input
                id="resendApiKey"
                type={showResendKey ? "text" : "password"}
                value={settings.resendApiKey ?? ""}
                onChange={(e) => setSettings({ ...settings, resendApiKey: e.target.value })}
                placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              />
              <button
                type="button"
                className="secondary"
                onClick={() => setShowResendKey(!showResendKey)}
                style={{ minWidth: 64 }}
              >
                {showResendKey ? "Hide" : "Show"}
              </button>
            </div>
            <span className="field-hint">Your Resend API token used for automated email alerts.</span>
          </div>

          <div className="settings-form-group" style={{ marginTop: 16 }}>
            <label htmlFor="alertEmail">Alert Recipient Email</label>
            <input
              id="alertEmail"
              type="email"
              value={settings.alertEmail ?? "delivered@resend.dev"}
              onChange={(e) => setSettings({ ...settings, alertEmail: e.target.value })}
              placeholder="you@example.com"
            />
            <span className="field-hint">The target email address where negative mention alert reports will be delivered.</span>
          </div>
        </div>

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
              placeholder="e.g. gemini-3.5-flash-lite"
            />
            <div className="preset-chips" style={{ marginTop: 8 }}>
              <span className="chip-label">Quick select:</span>
              {["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.6-flash", "gpt-4o-mini"].map((model) => (
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
          <button type="button" className="secondary" onClick={fetchSettings} disabled={saving || resettingDb}>
            Reset Changes
          </button>
          <button type="submit" disabled={saving || resettingDb} style={{ minWidth: 140 }}>
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

      {/* Danger Zone: Empty Database Option */}
      <div
        className="card settings-section"
        style={{
          marginTop: 40,
          border: "1px solid rgba(220, 38, 38, 0.4)",
          background: "rgba(220, 38, 38, 0.05)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, color: "#f87171" }}>🗑 Empty Database</h3>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-dim)" }}>
              Permanently delete all stored posts, comments, scrape runs, and keywords. This allows you to test fresh scrapes from scratch.
            </p>
          </div>

          <button
            type="button"
            onClick={handleResetDatabase}
            disabled={resettingDb}
            style={{
              background: "#dc2626",
              color: "#ffffff",
              border: "none",
              padding: "10px 20px",
              fontWeight: 600,
              fontSize: 13,
              borderRadius: 8,
              minWidth: 160,
              whiteSpace: "nowrap",
            }}
          >
            {resettingDb ? (
              <>
                <span className="spinner" style={{ marginRight: 8 }} />
                Emptying…
              </>
            ) : (
              "🗑 Empty Database"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
