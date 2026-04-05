import { describe, expect, it, vi } from "vitest";
import { TikTokAdapter } from "../../../src/adapters/tiktok/tiktokAdapter";
import type { ChatMessage, ChatAdapterStatus } from "../../../src/types";

describe("TikTokAdapter", () => {
  const mockTransport = () => {
    let eventHandler: any = null;
    return {
      connect: vi.fn().mockResolvedValue({ connectionId: "test-conn-1", roomId: "test-room-1" }),
      disconnect: vi.fn().mockResolvedValue(undefined),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      onEvent: vi.fn((handler) => {
        eventHandler = handler;
        return () => {
          eventHandler = null;
        };
      }),
      emitEvent: (event: any) => {
        if (eventHandler) eventHandler(event);
      },
    };
  };

  it("connects and sets status correctly", async () => {
    const transport = mockTransport();
    const adapter = new TikTokAdapter({ channel: "testchannel", transport });

    const statuses: ChatAdapterStatus[] = [];
    adapter.onStatus((status) => statuses.push(status));

    await adapter.connect();

    expect(transport.connect).toHaveBeenCalledWith({ channel: "testchannel" });
    expect(statuses).toContain("connecting");
    expect(statuses).toContain("connected");
  });

  it("handles transport 'connected' and 'disconnected' events correctly", async () => {
    const transport = mockTransport();
    const adapter = new TikTokAdapter({ channel: "testchannel", transport });

    const statuses: ChatAdapterStatus[] = [];
    adapter.onStatus((status) => statuses.push(status));

    await adapter.connect();

    transport.emitEvent({ connectionId: "test-conn-1", type: "disconnected" });
    expect(statuses).toContain("disconnected");

    transport.emitEvent({ connectionId: "test-conn-1", type: "connected" });
    // It should push another connected status
    expect(statuses[statuses.length - 1]).toBe("connected");
  });

  it("handles 'error' event correctly", async () => {
    const transport = mockTransport();
    const adapter = new TikTokAdapter({ channel: "testchannel", transport });

    const statuses: ChatAdapterStatus[] = [];
    adapter.onStatus((status) => statuses.push(status));

    await adapter.connect();

    transport.emitEvent({ connectionId: "test-conn-1", type: "error", error: "test error" });
    expect(statuses[statuses.length - 1]).toBe("error");
  });

  it("emits chat messages", async () => {
    const transport = mockTransport();
    const adapter = new TikTokAdapter({ channel: "testchannel", transport });

    const messages: ChatMessage[] = [];
    adapter.onMessage((msg) => messages.push(msg));

    await adapter.connect();

    const mockMessage: ChatMessage = {
      platform: "tiktok",
      channel: "testchannel",
      username: "testuser",
      message: "hello tiktok",
    };

    transport.emitEvent({
      connectionId: "test-conn-1",
      type: "chat",
      message: mockMessage,
    });

    expect(messages.length).toBe(1);
    expect(messages[0]).toEqual(mockMessage);
  });

  it("disconnects and unbinds events", async () => {
    const transport = mockTransport();
    const adapter = new TikTokAdapter({ channel: "testchannel", transport });

    const statuses: ChatAdapterStatus[] = [];
    adapter.onStatus((status) => statuses.push(status));

    await adapter.connect();
    await adapter.disconnect();

    expect(transport.disconnect).toHaveBeenCalledWith({ connectionId: "test-conn-1" });
    expect(statuses[statuses.length - 1]).toBe("disconnected");

    // further events should not affect anything
    transport.emitEvent({ connectionId: "test-conn-1", type: "error" });
    expect(statuses[statuses.length - 1]).toBe("disconnected"); // no new error status
  });

  it("sends a message correctly", async () => {
    const transport = mockTransport();
    const adapter = new TikTokAdapter({ channel: "testchannel", transport });

    await adapter.connect();
    await adapter.sendMessage("hello from adapter");

    expect(transport.sendMessage).toHaveBeenCalledWith({
      connectionId: "test-conn-1",
      message: "hello from adapter",
    });
  });

  it("ignores empty messages", async () => {
    const transport = mockTransport();
    const adapter = new TikTokAdapter({ channel: "testchannel", transport });

    await adapter.connect();
    await adapter.sendMessage("   ");

    expect(transport.sendMessage).not.toHaveBeenCalled();
  });

  it("throws error when sending a message before connecting", async () => {
    const transport = mockTransport();
    const adapter = new TikTokAdapter({ channel: "testchannel", transport });

    await expect(adapter.sendMessage("hello")).rejects.toThrow("TikTok connection is not ready.");
  });

  it("throws error when transport does not support sending messages", async () => {
    const transport = mockTransport();
    delete (transport as any).sendMessage; // Remove sendMessage capability
    const adapter = new TikTokAdapter({ channel: "testchannel", transport: transport as any });

    await adapter.connect();
    await expect(adapter.sendMessage("hello")).rejects.toThrow("TikTok sending is not enabled for this alpha build.");
  });

  it("ignores events from other connections", async () => {
    const transport = mockTransport();
    const adapter = new TikTokAdapter({ channel: "testchannel", transport });

    const statuses: ChatAdapterStatus[] = [];
    adapter.onStatus((status) => statuses.push(status));

    await adapter.connect();

    transport.emitEvent({ connectionId: "other-conn", type: "disconnected" });
    expect(statuses[statuses.length - 1]).toBe("connected"); // Still connected
  });
});
