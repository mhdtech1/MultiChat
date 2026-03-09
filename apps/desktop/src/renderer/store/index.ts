import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChatMessage } from "@multichat/chat-core";

type SettingsState = {
  showTimestamps: boolean;
  showBadges: boolean;
  setShowTimestamps: (enabled: boolean) => void;
  setShowBadges: (enabled: boolean) => void;
};

type ChatState = {
  messages: ChatMessage[];
  setMessages: (messages: ChatMessage[]) => void;
  appendMessage: (message: ChatMessage) => void;
  clearMessages: () => void;
};

const RENDERER_SETTINGS_STORAGE_KEY = "multichat:renderer-settings";
const CHAT_STORE_MAX_MESSAGES = 1000;

const clampMessages = (messages: ChatMessage[]) =>
  messages.length > CHAT_STORE_MAX_MESSAGES
    ? messages.slice(-CHAT_STORE_MAX_MESSAGES)
    : messages;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      showTimestamps: true,
      showBadges: true,
      setShowTimestamps: (enabled) => set({ showTimestamps: enabled }),
      setShowBadges: (enabled) => set({ showBadges: enabled }),
    }),
    {
      name: RENDERER_SETTINGS_STORAGE_KEY,
      partialize: (state) => ({
        showTimestamps: state.showTimestamps,
        showBadges: state.showBadges,
      }),
    },
  ),
);

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  setMessages: (messages) => set({ messages: clampMessages(messages) }),
  appendMessage: (message) =>
    set((state) => ({ messages: clampMessages([...state.messages, message]) })),
  clearMessages: () => set({ messages: [] }),
}));

export { useAuthStore } from "./authStore";
export { useAppSettingsStore } from "./appSettingsStore";
export { useConnectionStore } from "./connectionStore";
export { useTabStore } from "./tabStore";
export { useUIStore } from "./uiStore";
