import type { ChatMessage } from "../../types";
import type { IrcMessage } from "./ircParser";

export const normalizeTwitchMessage = (message: IrcMessage): ChatMessage | null => {
  if (message.command !== "PRIVMSG" || !message.trailing) return null;
  const channel = message.params[0]?.replace("#", "") ?? "";
  const username = message.prefix?.split("!")[0] ?? "";
  const displayName = message.tags["display-name"] || username;
  const badges = message.tags.badges ? message.tags.badges.split(",").filter(Boolean) : [];
  const timestampMs = message.tags["tmi-sent-ts"] ? Number(message.tags["tmi-sent-ts"]) : Date.now();

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
};
