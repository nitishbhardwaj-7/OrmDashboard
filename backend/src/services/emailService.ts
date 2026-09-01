import { env } from "../config/env";

export interface NegativeMentionPayload {
  type: "post" | "comment";
  keyword: string;
  platform: string;
  text: string;
  author: string;
  url: string;
  sentiment: string;
  confidence?: number | null;
  publishedAt?: Date | string | null;
}

export async function sendNegativeMentionAlert(item: NegativeMentionPayload): Promise<boolean> {
  const apiKey = env.RESEND_API_KEY?.trim() || "";
  if (!apiKey) {
    console.warn("Skipping email alert: RESEND_API_KEY is not configured.");
    return false;
  }

  const rawRecipients = env.ALERT_EMAIL?.trim() || "delivered@resend.dev";
  const recipientEmails = rawRecipients
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0);

  const finalRecipients = recipientEmails.length > 0 ? recipientEmails : ["delivered@resend.dev"];
  const platformName = (item.platform || "Social Media").toUpperCase();
  const itemType = item.type.toUpperCase();
  const dateStr = item.publishedAt ? new Date(item.publishedAt).toLocaleString() : new Date().toLocaleString();
  const confidencePct = typeof item.confidence === "number" ? Math.round(item.confidence * 100) : 100;

  const subject = `🚨 Negative ${itemType} Alert on ${platformName}: "${item.keyword}"`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      
      <!-- Header Banner -->
      <div style="background: #dc2626; color: #ffffff; padding: 20px 24px; text-align: left;">
        <span style="background: rgba(255,255,255,0.2); padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
          ${platformName} • ${itemType}
        </span>
        <h2 style="margin: 12px 0 4px 0; font-size: 20px; font-weight: 700;">🚨 Negative Brand Mention Detected</h2>
        <p style="margin: 0; font-size: 13px; opacity: 0.9;">Keyword: <strong>${escapeHtml(item.keyword)}</strong></p>
      </div>

      <!-- Content Details -->
      <div style="padding: 24px;">
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; color: #475569;">
          <tr>
            <td style="padding: 6px 0; font-weight: 600; width: 110px;">Platform:</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${escapeHtml(platformName)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: 600;">Author:</td>
            <td style="padding: 6px 0; color: #0f172a;">${escapeHtml(item.author || "Anonymous")}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: 600;">Date Found:</td>
            <td style="padding: 6px 0; color: #0f172a;">${escapeHtml(dateStr)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: 600;">AI Sentiment:</td>
            <td style="padding: 6px 0;">
              <span style="background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 700;">
                NEGATIVE (${confidencePct}% confidence)
              </span>
            </td>
          </tr>
        </table>

        <!-- Comment / Post Text Blockquote -->
        <div style="margin-bottom: 24px;">
          <label style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 8px;">
            Full ${itemType} Content:
          </label>
          <blockquote style="margin: 0; padding: 16px; background: #f8fafc; border-left: 4px solid #dc2626; border-radius: 4px; font-size: 14px; line-height: 1.6; color: #1e293b; white-space: pre-wrap;">
${escapeHtml(item.text || "No text content available.")}
          </blockquote>
        </div>

        <!-- Direct Link Button -->
        ${
          item.url
            ? `
          <div style="text-align: center; margin-top: 24px; padding-top: 16px; border-top: 1px solid #f1f5f9;">
            <a href="${escapeHtml(item.url)}" target="_blank" style="display: inline-block; background: #2563eb; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 10px 22px; border-radius: 8px;">
              🔗 View ${itemType} on ${platformName} →
            </a>
          </div>
        `
            : ""
        }
      </div>

      <!-- Footer -->
      <div style="background: #f8fafc; padding: 12px 24px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
        Sent automatically by <strong>ORM Dashboard Monitor</strong> • No repetitive alerts are sent for existing items.
      </div>
    </div>
  `;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "ORM Alert Monitor <onboarding@resend.dev>",
        to: finalRecipients,
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error(`Resend email alert failed (${response.status}): ${errText}`);
      return false;
    }

    const data: any = await response.json().catch(() => null);
    console.log(`✓ Resend email alert delivered successfully! ID: ${data?.id}`);
    return true;
  } catch (err: any) {
    console.error("Error sending Resend email alert:", err?.message || err);
    return false;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
