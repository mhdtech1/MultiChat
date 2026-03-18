import { create } from "zustand";
import type { ChatSource, ChatTab } from "../../shared/types";

type Updater<T> = T | ((previous: T) => T);

type TabStoreState = {
  sources: ChatSource[];
  tabs: ChatTab[];
  activeTabId: string;
  setSources: (updater: Updater<ChatSource[]>) => void;
  setTabs: (updater: Updater<ChatTab[]>) => void;
  setActiveTabId: (updater: Updater<string>) => void;
  resetTabs: () => void;
};

const applyUpdater = <T>(previous: T, updater: Updater<T>): T =>
  typeof updater === "function"
    ? (updater as (previousState: T) => T)(previous)
    : updater;

export const useTabStore = create<TabStoreState>((set) => ({
  sources: [],
  tabs: [],
  activeTabId: "",
  setSources: (updater) =>
    set((state) => ({
      sources: applyUpdater(state.sources, updater),
    })),
  setTabs: (updater) =>
    set((state) => ({
      tabs: applyUpdater(state.tabs, updater),
    })),
  setActiveTabId: (updater) =>
    set((state) => ({
      activeTabId: applyUpdater(state.activeTabId, updater),
    })),
  resetTabs: () =>
    set({
      sources: [],
      tabs: [],
      activeTabId: "",
    }),
}));
