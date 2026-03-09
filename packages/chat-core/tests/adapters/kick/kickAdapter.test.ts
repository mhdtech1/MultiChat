import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KickAdapter } from "../../../src/adapters/kick/kickAdapter";
import { MockWebSocket } from "../../helpers/mockWebSocket";
import type { ChatMessage } from "../../../src/types";

describe("KickAdapter", () => {
  beforeEach(() => {
    MockWebSocket.reset();
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("connects and subscribes to chatroom channel", async () => {
    const adapter = new KickAdapter({
      channel: "creator",
      resolveChatroomId: async () => 1234,
    });

    await adapter.connect();
    const socket = MockWebSocket.instances[0];
    expect(socket).toBeDefined();

    socket.emit("open", {});
    const subscribe = socket.sent.find((entry) =>
      entry.includes("pusher:subscribe"),
    );
    expect(subscribe).toBeDefined();
    expect(subscribe).toContain("chatrooms.1234.v2");
  });

  it("normalizes incoming chat messages from pusher payload", async () => {
    const adapter = new KickAdapter({
      channel: "creator",
      resolveChatroomId: async () => 1234,
    });
    const messages: ChatMessage[] = [];
    adapter.onMessage((message) => messages.push(message));

    await adapter.connect();
    const socket = MockWebSocket.instances[0];
    socket.emit("open", {});
    socket.emit("message", {
      data: JSON.stringify({
        event: "App\\Events\\ChatMessageEvent",
        data: JSON.stringify({
          id: "msg-1",
          content: "hello kick",
          created_at: "2025-01-01T00:00:00.000Z",
          sender: {
            username: "kickuser",
            identity: {
              color: "#00ff00",
              badges: ["moderator"],
            },
          },
        }),
      }),
    });

    expect(messages.at(-1)).toMatchObject({
      id: "msg-1",
      platform: "kick",
      channel: "creator",
      username: "kickuser",
      message: "hello kick",
      color: "#00ff00",
    });
  });
});
