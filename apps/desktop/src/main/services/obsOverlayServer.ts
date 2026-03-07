import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { OverlayFeedEvent, OverlayMessage, OverlaySourceRef, Platform } from "../../shared/types.js";

type OverlaySnapshotEvent = {
  type: "snapshot";
  messages: OverlayMessage[];
  sources: OverlaySourceRef[];
};

type OverlaySseEvent = OverlayFeedEvent | OverlaySnapshotEvent;

const HOST = "127.0.0.1";
const MAX_BUFFERED_MESSAGES = 500;

const isPlatform = (value: unknown): value is Platform =>
  value === "twitch" || value === "kick" || value === "youtube" || value === "tiktok";

const normalizeText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const normalizeOverlayMessage = (value: unknown): OverlayMessage | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = normalizeText(record.id);
  const platform = record.platform;
  const channel = normalizeText(record.channel);
  const message = typeof record.message === "string" ? record.message : "";
  if (!id || !isPlatform(platform) || !channel || !message) {
    return null;
  }

  const username = normalizeText(record.username) || undefined;
  const displayName = normalizeText(record.displayName) || undefined;
  const color = normalizeText(record.color) || undefined;
  const channelAvatarUrl = normalizeText(record.channelAvatarUrl) || undefined;
  const timestamp = normalizeText(record.timestamp) || undefined;

  return {
    id,
    platform,
    channel,
    username,
    displayName,
    message,
    color,
    channelAvatarUrl,
    timestamp
  };
};

const normalizeOverlaySources = (value: unknown): OverlaySourceRef[] => {
  if (!Array.isArray(value)) return [];
  const dedup = new Set<string>();
  const next: OverlaySourceRef[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const platform = record.platform;
    const channel = normalizeText(record.channel);
    if (!isPlatform(platform) || !channel) continue;
    const key = `${platform}:${channel.toLowerCase()}`;
    if (dedup.has(key)) continue;
    dedup.add(key);
    next.push({ platform, channel });
  }
  return next;
};

const normalizeOverlayFeedEvent = (value: unknown): OverlayFeedEvent | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const type = record.type;
  if (type === "chat") {
    const message = normalizeOverlayMessage(record.message);
    if (!message) return null;
    return { type: "chat", message };
  }
  if (type === "active-sources") {
    return {
      type: "active-sources",
      sources: normalizeOverlaySources(record.sources)
    };
  }
  return null;
};

const ssePayload = (event: OverlaySseEvent) => `data: ${JSON.stringify(event)}\n\n`;

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const overlayHtml = () => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>MultiChat OBS Overlay</title>
    <style>
      :root {
        color-scheme: only dark;
      }
      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: transparent;
        font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
      }
      #feed {
        position: fixed;
        inset: 0;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        gap: 4px;
        padding: 10px 14px 14px;
        box-sizing: border-box;
      }
      .line {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: clamp(18px, 2.1vw, 30px);
        line-height: 1.24;
        font-weight: 700;
        color: #fff;
        text-shadow:
          0 2px 4px rgba(0, 0, 0, 0.95),
          0 0 10px rgba(0, 0, 0, 0.85);
      }
      .badge {
        width: 24px;
        height: 24px;
        border-radius: 999px;
        overflow: hidden;
        flex: 0 0 auto;
        background: rgba(255, 255, 255, 0.18);
        border: 1px solid rgba(255, 255, 255, 0.26);
      }
      .badge img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .badge--fallback {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 800;
        color: #fff;
      }
      .name {
        font-weight: 800;
      }
      .line--twitch .name { color: #bf94ff; }
      .line--kick .name { color: #6dff2f; }
      .line--youtube .name { color: #ff7a7a; }
      .line--tiktok .name { color: #87f0ff; }
      .msg {
        color: #fff;
      }
    </style>
  </head>
  <body>
    <main id="feed"></main>
    <script>
      const params = new URLSearchParams(window.location.search);
      const followActiveTab = params.get("followActiveTab") !== "0";
      const maxMessages = Math.max(60, Math.min(600, Number.parseInt(params.get("max") || "220", 10) || 220));
      const feed = document.getElementById("feed");
      let activeSourceKeys = [];
      let messages = [];

      const esc = (value) =>
        String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");

      const keyForSource = (platform, channel) => String(platform) + ":" + String(channel || "").toLowerCase();
      const keyForMessage = (message) => keyForSource(message.platform, message.channel);
      const platformInitial = (platform) => {
        if (platform === "twitch") return "T";
        if (platform === "kick") return "K";
        if (platform === "youtube") return "Y";
        if (platform === "tiktok") return "TT";
        return "?";
      };

      const messageVisible = (message) => {
        if (!followActiveTab || activeSourceKeys.length === 0) return true;
        return activeSourceKeys.includes(keyForMessage(message));
      };

      const render = () => {
        const rows = messages.filter(messageVisible).slice(-maxMessages);
        feed.innerHTML = rows
          .map((message) => {
            const name = esc(message.displayName || message.username || "user");
            const text = esc(message.message || "");
            const colorStyle = message.color ? " style="color:" + esc(message.color) + """ : "";
            const avatar = typeof message.channelAvatarUrl === "string" && message.channelAvatarUrl.trim().length > 0
              ? "<span class="badge"><img src="" + esc(message.channelAvatarUrl) + "" referrerpolicy="no-referrer" /></span>"
              : "<span class="badge badge--fallback">" + platformInitial(message.platform) + "</span>";
            return "<div class="line line--" + esc(message.platform) + "">" + avatar + "<span class="name"" + colorStyle + ">" + name + "</span><span class="msg">: " + text + "</span></div>";
          })
          .join("");

        requestAnimationFrame(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
      };

      const applyPayload = (payload) => {
        if (!payload || typeof payload !== "object") return;
        if (payload.type === "snapshot") {
          messages = Array.isArray(payload.messages) ? payload.messages.slice(-maxMessages) : [];
          activeSourceKeys = Array.isArray(payload.sources)
            ? payload.sources.map((source) => keyForSource(source.platform, source.channel))
            : [];
          render();
          return;
        }
        if (payload.type === "active-sources") {
          activeSourceKeys = Array.isArray(payload.sources)
            ? payload.sources.map((source) => keyForSource(source.platform, source.channel))
            : [];
          render();
          return;
        }
        if (payload.type === "chat" && payload.message) {
          messages.push(payload.message);
          if (messages.length > maxMessages * 2) {
            messages = messages.slice(-maxMessages * 2);
          }
          render();
        }
      };

      const source = new EventSource("/obs-overlay/events");
      source.onmessage = (event) => {
        try {
          applyPayload(JSON.parse(event.data));
        } catch {
          // no-op
        }
      };
      source.onerror = () => {
        // Browser reconnect is automatic.
      };
    </script>
  </body>
</html>`;

export class ObsOverlayServer {
  private server: Server | null = null;
  private port = 0;
  private clients = new Set<ServerResponse<IncomingMessage>>();
  private recentMessages: OverlayMessage[] = [];
  private activeSources: OverlaySourceRef[] = [];

  async start(): Promise<string> {
    if (this.server && this.port > 0) {
      return this.url();
    }

    this.server = createServer((request, response) => {
      this.handleRequest(request, response);
    });

    await new Promise<void>((resolve, reject) => {
      const server = this.server;
      if (!server) {
        reject(new Error("OBS overlay server was not initialized."));
        return;
      }
      server.once("error", reject);
      server.listen(0, HOST, () => {
        server.removeListener("error", reject);
        const address = server.address();
        if (!address || typeof address === "string") {
          reject(new Error("OBS overlay server failed to bind a local port."));
          return;
        }
        this.port = address.port;
        resolve();
      });
    });

    return this.url();
  }

  async stop(): Promise<void> {
    for (const client of this.clients) {
      try {
        client.end();
      } catch {
        // no-op
      }
    }
    this.clients.clear();

    if (!this.server) {
      this.port = 0;
      return;
    }

    await new Promise<void>((resolve) => {
      const server = this.server;
      if (!server) {
        resolve();
        return;
      }
      server.close(() => resolve());
    });

    this.server = null;
    this.port = 0;
  }

  ingest(rawEvent: unknown): void {
    const event = normalizeOverlayFeedEvent(rawEvent);
    if (!event) return;

    if (event.type === "chat") {
      this.recentMessages.push(event.message);
      if (this.recentMessages.length > MAX_BUFFERED_MESSAGES) {
        this.recentMessages = this.recentMessages.slice(-MAX_BUFFERED_MESSAGES);
      }
    } else {
      this.activeSources = event.sources;
    }

    this.broadcast(event);
  }

  getUrl(): string | null {
    if (this.port <= 0) return null;
    return this.url();
  }

  private url() {
    return `http://${HOST}:${this.port}/obs-overlay`;
  }

  private handleRequest(request: IncomingMessage, response: ServerResponse<IncomingMessage>) {
    const method = (request.method ?? "GET").toUpperCase();
    const requestUrl = new URL(request.url ?? "/", `http://${HOST}`);

    if (method === "GET" && requestUrl.pathname === "/obs-overlay") {
      const html = overlayHtml();
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, max-age=0"
      });
      response.end(html);
      return;
    }

    if (method === "GET" && requestUrl.pathname === "/obs-overlay/events") {
      this.handleEventStream(request, response);
      return;
    }

    if (method === "GET" && requestUrl.pathname === "/obs-overlay/health") {
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, max-age=0"
      });
      response.end(JSON.stringify({ ok: true, clients: this.clients.size }));
      return;
    }

    response.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, max-age=0"
    });
    response.end("Not found");
  }

  private handleEventStream(request: IncomingMessage, response: ServerResponse<IncomingMessage>) {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*"
    });
    response.write(`retry: 2000\n\n`);

    this.clients.add(response);
    this.writeEvent(response, {
      type: "snapshot",
      messages: this.recentMessages,
      sources: this.activeSources
    });

    request.on("close", () => {
      this.clients.delete(response);
      try {
        response.end();
      } catch {
        // no-op
      }
    });
  }

  private broadcast(event: OverlaySseEvent) {
    for (const client of this.clients) {
      this.writeEvent(client, event);
    }
  }

  private writeEvent(client: ServerResponse<IncomingMessage>, event: OverlaySseEvent) {
    try {
      client.write(ssePayload(event));
    } catch {
      this.clients.delete(client);
      try {
        client.end();
      } catch {
        // no-op
      }
    }
  }
}
