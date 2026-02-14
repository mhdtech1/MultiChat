import type { ChatMessage } from "../../types";
import type { IrcMessage } from "./ircParser";

const unescapeIrcTagValue = (value: string) =>
  value
    .replace(/\\s/g, " ")
    .replace(/\\:/g, ";")
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\\\/g, "\\");

export const normalizeTwitchMessage = (message: IrcMessage): ChatMessage | null => {
  const channel = message.params[0]?.replace("#", "") ?? "";
  const username = message.prefix?.split("!")[0] ?? "";
  const displayName = message.tags["display-name"] || username || "Twitch";
  const badges = message.tags.badges ? message.tags.badges.split(",").filter(Boolean) : [];
  const timestampMs = message.tags["tmi-sent-ts"] ? Number(message.tags["tmi-sent-ts"]) : Date.now();

  if (message.command === "PRIVMSG" && message.trailing) {
    return {
      id: `${message.tags.id || `${timestampMs}-${username}`}`,
      platform: "twitch",
      channel,
      username,
      displayName,
      message: message.trailing,
      timestamp: new Date(timestampMs).toISOString(),
      badges,
      color: message.tags.color || undefined,
      raw: message.tags
    };
  }

  if (message.command === "USERNOTICE") {
    const systemTextRaw = message.tags["system-msg"] || "";
    const systemText = systemTextRaw ? unescapeIrcTagValue(systemTextRaw) : "";
    const content = (message.trailing || systemText).trim();
    if (!content) return null;

    return {
      id: `${message.tags.id || `${timestampMs}-${username || "notice"}`}`,
      platform: "twitch",
      channel,
      username: username || "twitch",
      displayName: displayName || "Twitch",
      message: content,
      timestamp: new Date(timestampMs).toISOString(),
      badges,
      color: message.tags.color || undefined,
      raw: {
        ...message.tags,
        eventType: "usernotice",
        msgId: message.tags["msg-id"] || undefined
      }
    };
  }

  return null;
};
