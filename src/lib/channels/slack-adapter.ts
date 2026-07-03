import { createHmac, timingSafeEqual } from "crypto";
import type { ChannelAdapter, ChannelMessage, ChannelDeliveryResult, InboundMessage } from "./types";

/**
 * Convert basic Markdown to Slack mrkdwn format.
 * - **bold** -> *bold*
 * - `code` stays as-is
 * - Links stay as-is
 */
function toSlackMrkdwn(md: string): string {
  return md
    .replace(/\*\*(.+?)\*\*/g, "*$1*") // bold
    .replace(/~~(.+?)~~/g, "~$1~"); // strikethrough
}

export const slackAdapter: ChannelAdapter = {
  channelType: "slack",

  async send(message: ChannelMessage, config: Record<string, unknown>): Promise<ChannelDeliveryResult> {
    const webhookUrl = config.webhookUrl as string;
    if (!webhookUrl) {
      return { success: false, error: "Missing webhookUrl in config" };
    }

    const text = message.format === "markdown"
      ? toSlackMrkdwn(`*${message.subject}*\n\n${message.body}`)
      : `${message.subject}\n\n${message.body}`;

    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        const body = await res.text();
        return { success: false, error: `Slack webhook returned ${res.status}: ${body}` };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  async testConnection(config: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    const webhookUrl = config.webhookUrl as string;
    if (!webhookUrl) {
      return { ok: false, error: "Missing webhookUrl" };
    }

    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Relay channel test - connection OK" }),
      });

      if (!res.ok) {
        const body = await res.text();
        return { ok: false, error: `Webhook returned ${res.status}: ${body}` };
      }

      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  // ── Bidirectional support ────────────────────────────────────────────

  parseInbound(rawBody: unknown): InboundMessage | null {
    const payload = rawBody as SlackEventPayload;
    const event = payload?.event;
    if (!event || event.type !== "message" || !event.text) return null;

    // Filter bot messages and message_changed subtypes
    if (event.bot_id || event.subtype) return null;

    return {
      text: event.text,
      senderName: event.user,
      senderId: event.user,
      // Use thread_ts if in a thread, otherwise message ts becomes the thread root
      externalThreadId: event.thread_ts ?? event.ts,
      externalMessageId: event.ts,
      isBot: !!event.bot_id,
      raw: rawBody,
    };
  },

  verifySignature(
    rawBody: string,
    headers: Record<string, string>,
    config: Record<string, unknown>
  ): boolean {
    const signingSecret = config.signingSecret as string;
    if (!signingSecret) return false;

    const timestamp = headers["x-slack-request-timestamp"];
    const signature = headers["x-slack-signature"];
    if (!timestamp || !signature) return false;

    // Reject requests older than 5 minutes (replay attack protection)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > 300) return false;

    const sigBasestring = `v0:${timestamp}:${rawBody}`;
    const mySignature = `v0=${createHmac("sha256", signingSecret)
      .update(sigBasestring)
      .digest("hex")}`;

    try {
      return timingSafeEqual(
        Buffer.from(mySignature, "utf8"),
        Buffer.from(signature, "utf8")
      );
    } catch {
      return false;
    }
  },

  async sendReply(
    message: ChannelMessage,
    config: Record<string, unknown>,
    threadId?: string
  ): Promise<ChannelDeliveryResult> {
    const botToken = config.botToken as string;
    const channelId = config.slackChannelId as string;

    if (!botToken || !channelId) {
      return { success: false, error: "Missing botToken or slackChannelId for reply" };
    }

    const text = message.body || message.subject;
    if (!text) {
      return { success: false, error: "Empty message body" };
    }

    try {
      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: channelId,
          text: toSlackMrkdwn(text),
          ...(threadId ? { thread_ts: threadId } : {}),
        }),
      });

      const data = (await res.json()) as {
        ok: boolean;
        ts?: string;
        error?: string;
      };

      if (!data.ok) {
        return { success: false, error: data.error ?? `Slack API error` };
      }

      return { success: true, externalId: data.ts };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};

// ── Slack event types (minimal subset) ─────────────────────────────────

interface SlackEventPayload {
  type: string; // "url_verification" | "event_callback"
  challenge?: string;
  token?: string;
  event?: {
    type: string; // "message"
    text?: string;
    user?: string;
    bot_id?: string;
    subtype?: string;
    ts?: string;
    thread_ts?: string;
    channel?: string;
  };
}
