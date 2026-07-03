import type { ChannelAdapter, ChannelMessage, ChannelDeliveryResult } from "./types";

export const webhookAdapter: ChannelAdapter = {
  channelType: "webhook",

  async send(message: ChannelMessage, config: Record<string, unknown>): Promise<ChannelDeliveryResult> {
    const url = config.url as string;
    if (!url) {
      return { success: false, error: "Missing url in config" };
    }

    const customHeaders = (config.headers ?? {}) as Record<string, string>;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...customHeaders,
        },
        body: JSON.stringify({
          subject: message.subject,
          body: message.body,
          format: message.format,
          metadata: message.metadata ?? {},
          timestamp: new Date().toISOString(),
          source: "relay",
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        return { success: false, error: `Webhook returned ${res.status}: ${body.slice(0, 200)}` };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  async testConnection(config: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    const url = config.url as string;
    if (!url) {
      return { ok: false, error: "Missing url" };
    }

    const customHeaders = (config.headers ?? {}) as Record<string, string>;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...customHeaders,
        },
        body: JSON.stringify({
          test: true,
          source: "relay",
          timestamp: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        return { ok: false, error: `Webhook returned ${res.status}: ${body.slice(0, 200)}` };
      }

      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
