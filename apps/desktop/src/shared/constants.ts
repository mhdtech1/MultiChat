export const IPC_CHANNELS = {
  SETTINGS_GET: "settings:get",
  SETTINGS_SET: "settings:set",
  LOG_WRITE: "log:write",
  LOG_TOGGLE: "log:toggle",

  AUTH_TWITCH_SIGN_IN: "auth:twitch:signIn",
  AUTH_TWITCH_SIGN_OUT: "auth:twitch:signOut",
  AUTH_KICK_SIGN_IN: "auth:kick:signIn",
  AUTH_KICK_SIGN_OUT: "auth:kick:signOut",
  AUTH_KICK_REFRESH: "auth:kick:refresh",
  AUTH_YOUTUBE_SIGN_IN: "auth:youtube:signIn",
  AUTH_YOUTUBE_SIGN_OUT: "auth:youtube:signOut",
  AUTH_TIKTOK_SIGN_IN: "auth:tiktok:signIn",
  AUTH_TIKTOK_SIGN_OUT: "auth:tiktok:signOut",
  AUTH_GET_HEALTH: "auth:getHealth",
  AUTH_TEST_PERMISSIONS: "auth:testPermissions",
  MODERATION_ACT: "moderation:act",
  MODERATION_CAN_MODERATE: "moderation:canModerate",
  KICK_RESOLVE_CHATROOM: "kick:resolveChatroom",
  YOUTUBE_RESOLVE_LIVE_CHAT: "youtube:resolveLiveChat",
  YOUTUBE_FETCH_MESSAGES: "youtube:fetchMessages",
  YOUTUBE_SEND_MESSAGE: "youtube:sendMessage",
  TIKTOK_CONNECT: "tiktok:connect",
  TIKTOK_DISCONNECT: "tiktok:disconnect",
  TIKTOK_SEND_MESSAGE: "tiktok:sendMessage",
  TIKTOK_EVENT: "tiktok:event",
  UPDATES_CHECK: "updates:check",
  UPDATES_DOWNLOAD: "updates:download",
  UPDATES_SET_CHANNEL: "updates:setChannel",
  UPDATES_INSTALL: "updates:install",
  UPDATES_GET_STATUS: "updates:getStatus",
  UPDATES_STATUS_EVENT: "updates:status",
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export const AUTH = {
  OAUTH_CALLBACK_TIMEOUT_MS: 3 * 60 * 1000,
  OAUTH_HTTP_PORT: 51730,
  TIKTOK_AUTH_TIMEOUT_MS: 4 * 60 * 1000,
} as const;
