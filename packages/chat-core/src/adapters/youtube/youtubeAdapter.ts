import EventEmitter from "eventemitter3";
import type { ChatAdapter, ChatAdapterOptions, ChatAdapterStatus, ChatMessage } from "../../types";

export type YouTubeAuth = {
  apiKey?: string;
  liveChatId?: string;
};

export class YouTubeAdapter implements ChatAdapter {
  private emitter = new EventEmitter();
  private status: ChatAdapterStatus = "disconnected";
  private readonly channel: string;
  private readonly auth: YouTubeAuth;
  private readonly logger?: (message: string) => void;
  private pollTimer: number | null = null;
  private nextPageToken: string | undefined;

  constructor(options: ChatAdapterOptions & { auth?: YouTubeAuth }) {
    this.channel = options.channel;
    this.auth = options.auth ?? {};
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

  async connect() {
    if (!this.auth.apiKey || !this.auth.liveChatId) {
      this.logger?.("YouTube adapter requires an API key and Live Chat ID.");
      this.setStatus("error");
      return;
    }

    this.setStatus("connecting");
    this.logger?.("Connecting to YouTube Live Chat...");
    await this.poll();
    this.setStatus("connected");
    this.pollTimer = window.setInterval(() => void this.poll(), 5000);
  }

  private async poll() {
    if (!this.auth.apiKey || !this.auth.liveChatId) return;
    const params = new URLSearchParams({
      part: "snippet,authorDetails",
      liveChatId: this.auth.liveChatId,
      key: this.auth.apiKey
    });
    if (this.nextPageToken) params.set("pageToken", this.nextPageToken);

    try {
      const response = await fetch(`https://www.googleapis.com/youtube/v3/liveChat/messages?${params}`);
      const data = await response.json();
      this.nextPageToken = data.nextPageToken;
      if (Array.isArray(data.items)) {
        data.items.forEach((item: any) => {
          const message: ChatMessage = {
            id: item.id,
            platform: "youtube",
            channel: this.channel,
            username: item.authorDetails?.channelId ?? "",
            displayName: item.authorDetails?.displayName ?? "",
            message: item.snippet?.displayMessage ?? "",
            timestamp: item.snippet?.publishedAt ?? new Date().toISOString(),
            badges: item.authorDetails?.isChatModerator ? ["moderator"] : [],
            raw: item
          };
          this.emitter.emit("message", message);
        });
      }
    } catch (error) {
      this.logger?.(`YouTube polling error: ${String(error)}`);
    }
  }

  async disconnect() {
    if (this.pollTimer) window.clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.setStatus("disconnected");
  }

  async sendMessage(_message: string) {
    throw new Error("Sending YouTube chat messages is not supported in this build.");
  }
}
