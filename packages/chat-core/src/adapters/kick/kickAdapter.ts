import EventEmitter from "eventemitter3";
import type { ChatAdapter, ChatAdapterOptions, ChatAdapterStatus, ChatMessage } from "../../types";

export type KickAuth = {
  accessToken?: string;
  username?: string;
  guest?: boolean;
};

type KickChannelApiResponse = {
  id?: number;
  slug?: string;
  chatroom?: {
    id?: number;
  };
  chatroom_id?: number;
  data?: unknown;
};

type KickPusherEnvelope = {
  event?: string;
  channel?: string;
  data?: unknown;
};

type KickSender = {
  username?: string;
  slug?: string;
  identity?: {
    color?: string;
    badges?: unknown;
  };
};

type KickRawChatMessage = {
  id?: string | number;
  content?: string;
  created_at?: string;
  type?: string;
  sender?: KickSender;
};

const KICK_PUSHER_WS_URL = "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679";

const decodeKickEmotes = (input: string) => input.replace(/\[emote:\d+:([^[\]]+)\]/g, "$1");

const parseJson = <T>(raw: string): T | null => {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const parseKickBadges = (badges: unknown): string[] => {
  if (!Array.isArray(badges)) return [];
  return badges
    .map((badge) => {
      if (typeof badge === "string") return badge;
      if (!badge || typeof badge !== "object") return "";
      const record = badge as Record<string, unknown>;
      const type = typeof record.type === "string" ? record.type : "";
      const text = typeof record.text === "string" ? record.text : "";
      const count = typeof record.count === "number" ? `:${record.count}` : "";
      return `${type || text}${count}`.trim();
    })
    .filter(Boolean);
};

export class KickAdapter implements ChatAdapter {
  private emitter = new EventEmitter();
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private chatroomId: number | null = null;
  private broadcasterUserId: number | null = null;
  private status: ChatAdapterStatus = "disconnected";
  private readonly channel: string;
  private readonly auth: KickAuth;
  private readonly chatroomResolver?: (channel: string) => Promise<number>;
  private readonly logger?: (message: string) => void;

  constructor(options: ChatAdapterOptions & { auth?: KickAuth; resolveChatroomId?: (channel: string) => Promise<number> }) {
    this.channel = options.channel;
    this.auth = options.auth ?? {};
    this.chatroomResolver = options.resolveChatroomId;
    this.logger = options.logger;
  }

  onMessage(handler: (message: ChatMessage) => void) {
    this.emitter.on("message", handler);
  }

  onStatus(handler: (status: ChatAdapterStatus) => void) {
    this.emitter.on("status", handler);
  }

  private setStatus(status: ChatAdapterStatus) {
    this.status = status;
    this.emitter.emit("status", status);
  }

  private extractChatroomId(payload: unknown): number | null {
    if (!payload || typeof payload !== "object") return null;
    const record = payload as KickChannelApiResponse;

    if (typeof record.chatroom?.id === "number") return record.chatroom.id;
    if (typeof record.chatroom_id === "number") return record.chatroom_id;

    if (Array.isArray(record.data)) {
      for (const item of record.data) {
        const found = this.extractChatroomId(item);
        if (found) return found;
      }
    } else if (record.data && typeof record.data === "object") {
      const found = this.extractChatroomId(record.data);
      if (found) return found;
    }

    return null;
  }

  private extractBroadcasterUserId(payload: unknown): number | null {
    if (!payload || typeof payload !== "object") return null;
    const record = payload as Record<string, unknown>;

    if (typeof record.broadcaster_user_id === "number") return record.broadcaster_user_id;
    if (typeof record.user_id === "number") return record.user_id;

    const user = record.user;
    if (user && typeof user === "object") {
      const userId = (user as Record<string, unknown>).id;
      if (typeof userId === "number") return userId;
    }

    if (Array.isArray(record.data)) {
      for (const item of record.data) {
        const found = this.extractBroadcasterUserId(item);
        if (found) return found;
      }
    } else if (record.data && typeof record.data === "object") {
      const found = this.extractBroadcasterUserId(record.data);
      if (found) return found;
    }

    return null;
  }

  private async resolveChatroomId(): Promise<number> {
    if (this.chatroomResolver) {
      const resolved = await this.chatroomResolver(this.channel);
      if (Number.isFinite(resolved) && resolved > 0) {
        return resolved;
      }
    }

    const endpoint = `https://kick.com/api/v2/channels/${encodeURIComponent(this.channel)}`;
    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json, text/plain, */*"
      }
    });

    const text = await response.text();
    const payload = text ? parseJson<KickChannelApiResponse>(text) : null;

    if (!response.ok || !payload) {
      const detail =
        typeof payload === "object" && payload && "message" in payload && typeof payload.message === "string"
          ? payload.message
          : `Kick channel lookup failed (${response.status})`;
      throw new Error(detail);
    }

    const chatroomId = this.extractChatroomId(payload);
    if (!chatroomId) {
      throw new Error(
        "Kick chatroom lookup failed. Kick may be blocking automated requests; try again in a few minutes."
      );
    }
    return chatroomId;
  }

  private createSocketUrl() {
    const url = new URL(KICK_PUSHER_WS_URL);
    url.searchParams.set("protocol", "7");
    url.searchParams.set("client", "js");
    url.searchParams.set("version", "8.4.0");
    url.searchParams.set("flash", "false");
    return url.toString();
  }

  private normalizeKickMessage(data: KickRawChatMessage): ChatMessage | null {
    const rawContent = typeof data.content === "string" ? data.content : "";
    if (!rawContent) return null;

    const sender = data.sender ?? {};
    const username = sender.username || sender.slug || "kick-user";
    const identity = sender.identity ?? {};
    const badges = parseKickBadges(identity.badges);

    return {
      id: typeof data.id === "string" || typeof data.id === "number" ? String(data.id) : `${Date.now()}`,
      platform: "kick",
      channel: this.channel,
      username,
      displayName: username,
      message: decodeKickEmotes(rawContent),
      timestamp: data.created_at ?? new Date().toISOString(),
      badges,
      color: identity.color,
      raw: data as unknown as Record<string, unknown>
    };
  }

  private handleSocketMessage(raw: string) {
    const envelope = parseJson<KickPusherEnvelope>(raw);
    if (!envelope?.event) return;

    if (envelope.event === "pusher:ping") {
      this.socket?.send(JSON.stringify({ event: "pusher:pong", data: {} }));
      return;
    }

    if (envelope.event.startsWith("pusher:") || envelope.event.startsWith("pusher_internal:")) return;
    if (envelope.event !== "App\\Events\\ChatMessageEvent") return;

    const payload =
      typeof envelope.data === "string"
        ? parseJson<KickRawChatMessage>(envelope.data)
        : (envelope.data as KickRawChatMessage | null);
    if (!payload) return;

    const message = this.normalizeKickMessage(payload);
    if (message) {
      this.emitter.emit("message", message);
    }
  }

  private scheduleReconnect() {
    if (this.status === "disconnected") return;
    if (!this.chatroomId) return;

    const delay = Math.min(30_000, 1000 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts += 1;
    this.setStatus("connecting");
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectSocketOnly();
    }, delay);
  }

  private async connectSocketOnly() {
    if (!this.chatroomId) return;
    if (this.socket) return;

    const socket = new WebSocket(this.createSocketUrl());
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.reconnectAttempts = 0;
      this.setStatus("connected");
      socket.send(
        JSON.stringify({
          event: "pusher:subscribe",
          data: { auth: "", channel: `chatrooms.${this.chatroomId}.v2` }
        })
      );
      this.logger?.(`Kick connected to ${this.channel} (chatroom ${this.chatroomId}).`);
    });

    socket.addEventListener("message", (event) => {
      this.handleSocketMessage(String(event.data));
    });

    socket.addEventListener("close", () => {
      this.socket = null;
      this.logger?.("Kick websocket closed.");
      this.scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      this.setStatus("error");
      this.logger?.("Kick websocket error.");
    });
  }

  async connect() {
    if (this.socket || this.status === "connecting") return;
    this.setStatus("connecting");
    this.logger?.("Connecting to Kick chat...");

    if (!this.chatroomId) {
      this.chatroomId = await this.resolveChatroomId();
    }

    await this.connectSocketOnly();
  }

  async disconnect() {
    this.setStatus("disconnected");
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  private async resolveBroadcasterUserId(): Promise<number> {
    if (this.broadcasterUserId) {
      return this.broadcasterUserId;
    }

    if (!this.auth.accessToken || this.auth.guest) {
      throw new Error("Kick send requires a signed-in account.");
    }

    const params = new URLSearchParams();
    params.append("slug", this.channel);

    const response = await fetch(`https://api.kick.com/public/v1/channels?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${this.auth.accessToken}`,
        Accept: "application/json"
      }
    });

    const text = await response.text();
    const payload = text ? parseJson<unknown>(text) : null;

    let broadcasterUserId = response.ok && payload ? this.extractBroadcasterUserId(payload) : null;
    if (!broadcasterUserId) {
      // Fallback to public website channel payload when API auth is restricted.
      const fallback = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(this.channel)}`, {
        headers: {
          Accept: "application/json, text/plain, */*"
        }
      });
      const fallbackText = await fallback.text();
      const fallbackPayload = fallbackText ? parseJson<unknown>(fallbackText) : null;
      broadcasterUserId = fallback.ok && fallbackPayload ? this.extractBroadcasterUserId(fallbackPayload) : null;
    }

    if (!broadcasterUserId) {
      throw new Error(`Kick broadcaster ID lookup failed (${response.status}).`);
    }

    this.broadcasterUserId = broadcasterUserId;
    return broadcasterUserId;
  }

  async sendMessage(message: string) {
    const content = message.trim();
    if (!content) return;
    if (content.length > 500) {
      throw new Error("Message is too long.");
    }

    if (!this.auth.accessToken || this.auth.guest) {
      throw new Error("Kick send requires a signed-in account.");
    }

    const broadcasterUserId = await this.resolveBroadcasterUserId();
    const response = await fetch("https://api.kick.com/public/v1/chat", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.auth.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        broadcaster_user_id: broadcasterUserId,
        content,
        type: "user"
      })
    });

    if (!response.ok) {
      const text = await response.text();
      const parsed = text ? parseJson<Record<string, unknown>>(text) : null;
      const messageText =
        parsed && typeof parsed.message === "string"
          ? parsed.message
          : `Kick message send failed (${response.status}).`;
      throw new Error(messageText);
    }
  }
}
