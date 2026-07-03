import type { ChannelAdapter, ChannelMessage, ChannelDeliveryResult, InboundMessage } from "./types";

/**
 * Escape special characters for Telegram MarkdownV2 format.
 */
function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

/**
 * Convert basic Markdown to Telegram MarkdownV2.
 * We escape special chars first, then re-apply bold/code formatting.
 */
function toTelegramMarkdownV2(subject: string, body: string): string {
  const escapedSubject = escapeMarkdownV2(subject);
  const escapedBody = escapeMarkdownV2(body);
  return `*${escapedSubject}*\n\n${escapedBody}`;
}

export const telegramAdapter: ChannelAdapter = {
  channelType: "telegram",

  async send(message: ChannelMessage, config: Record<string, unknown>): Promise<ChannelDeliveryResult> {
    const botToken = config.botToken as string;
    const chatId = config.chatId as string;

    if (!botToken || !chatId) {
      return { success: false, error: "Missing botToken or chatId in config" };
    }

    const text = message.format === "markdown"
      ? toTelegramMarkdownV2(message.subject, message.body)
      : `${message.subject}\n\n${message.body}`;

    const parseMode = message.format === "markdown" ? "MarkdownV2" : undefined;

    try {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          ...(parseMode ? { parse_mode: parseMode } : {}),
        }),
      });

      const data = await res.json() as { ok: boolean; result?: { message_id: number }; description?: string };

      if (!data.ok) {
        return { success: false, error: data.description ?? `Telegram API error (${res.status})` };
      }

      return { success: true, externalId: String(data.result?.message_id) };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  async testConnection(config: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    const botToken = config.botToken as string;
    const chatId = config.chatId as string;
    if (!botToken || !chatId) {
      return { ok: false, error: "Missing botToken or chatId" };
    }

    try {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "Relay channel test \\- connection OK",
          parse_mode: "MarkdownV2",
        }),
      });
      const data = await res.json() as { ok: boolean; description?: string };

      if (!data.ok) {
        return { ok: false, error: data.description ?? "Telegram sendMessage failed" };
      }

      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  // ── Bidirectional support ────────────────────────────────────────────

  parseInbound(rawBody: unknown): InboundMessage | null {
    const update = rawBody as TelegramUpdate;
    const msg = update?.message;
    if (!msg?.text) return null;

    return {
      text: msg.text,
      senderName: msg.from?.first_name
        ? `${msg.from.first_name}${msg.from.last_name ? ` ${msg.from.last_name}` : ""}`
        : undefined,
      senderId: msg.from?.id ? String(msg.from.id) : undefined,
      externalThreadId: String(msg.chat.id),
      externalMessageId: String(msg.message_id),
      isBot: msg.from?.is_bot ?? false,
      raw: rawBody,
    };
  },

  async sendReply(
    message: ChannelMessage,
    config: Record<string, unknown>,
    threadId?: string
  ): Promise<ChannelDeliveryResult> {
    const botToken = config.botToken as string;
    const chatId = threadId ?? (config.chatId as string);

    if (!botToken || !chatId) {
      return { success: false, error: "Missing botToken or chatId for reply" };
    }

    // For replies, send body directly (subject is empty in gateway context)
    const text = message.body || message.subject;
    if (!text) {
      return { success: false, error: "Empty message body" };
    }

    try {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          // Skip MarkdownV2 for replies — raw text avoids escape issues with agent output
        }),
      });

      const data = await res.json() as { ok: boolean; result?: { message_id: number }; description?: string };

      if (!data.ok) {
        return { success: false, error: data.description ?? `Telegram API error (${res.status})` };
      }

      return { success: true, externalId: String(data.result?.message_id) };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};

// ── Telegram types (minimal subset) ────────────────────────────────────

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      is_bot: boolean;
      first_name: string;
      last_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    date: number;
    text?: string;
  };
}

/**
 * Register a Telegram webhook for bidirectional mode.
 * Call this when a channel config is set to direction="bidirectional".
 */
export async function registerTelegramWebhook(
  botToken: string,
  webhookUrl: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/setWebhook`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl }),
    });
    const data = await res.json() as { ok: boolean; description?: string };
    if (!data.ok) {
      return { ok: false, error: data.description ?? "setWebhook failed" };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Remove a Telegram webhook (revert to outbound-only).
 */
export async function removeTelegramWebhook(
  botToken: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/deleteWebhook`;
    const res = await fetch(url, { method: "POST" });
    const data = await res.json() as { ok: boolean; description?: string };
    if (!data.ok) {
      return { ok: false, error: data.description ?? "deleteWebhook failed" };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
