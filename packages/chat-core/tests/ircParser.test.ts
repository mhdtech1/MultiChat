import { describe, expect, it } from "vitest";
import { parseIrcMessage } from "../src/adapters/twitch/ircParser";
import { normalizeTwitchMessage } from "../src/adapters/twitch/normalize";

describe("parseIrcMessage", () => {
  it("parses tag-prefixed PRIVMSG", () => {
    const line = "@badge-info=;badges=moderator/1;color=#1E90FF;display-name=TestUser;emotes=;id=abc-123;mod=1;tmi-sent-ts=1710000000000 :testuser!testuser@testuser.tmi.twitch.tv PRIVMSG #twitch :hello world";
    const parsed = parseIrcMessage(line);
    expect(parsed?.tags["display-name"]).toBe("TestUser");
    expect(parsed?.command).toBe("PRIVMSG");
    expect(parsed?.params[0]).toBe("#twitch");
    expect(parsed?.trailing).toBe("hello world");
  });

  it("parses PING without tags", () => {
    const parsed = parseIrcMessage("PING :tmi.twitch.tv");
    expect(parsed?.command).toBe("PING");
    expect(parsed?.trailing).toBe("tmi.twitch.tv");
  });
});

describe("normalizeTwitchMessage", () => {
  it("normalizes PRIVMSG into ChatMessage", () => {
    const line = "@badges=subscriber/3;color=#00FF00;display-name=Cat;id=msg1;tmi-sent-ts=1710000000000 :cat!cat@cat.tmi.twitch.tv PRIVMSG #twitch :meow";
    const parsed = parseIrcMessage(line);
    const message = parsed ? normalizeTwitchMessage(parsed) : null;
    expect(message?.platform).toBe("twitch");
    expect(message?.channel).toBe("twitch");
    expect(message?.displayName).toBe("Cat");
    expect(message?.message).toBe("meow");
  });
});
