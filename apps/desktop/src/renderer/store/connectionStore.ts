import { create } from "zustand";
import type { ChatAdapterStatus } from "@chatrix/chat-core";

type Updater<T> = T | ((previous: T) => T);

type ConnectionHealthState = {
  lastStatus: ChatAdapterStatus;
  lastStatusAt: number;
  lastMessageAt?: number;
  lastConnectedAt?: number;
  reconnectReason?: string;
  lastError?: string;
};

type ConnectionStoreState = {
  connectionHealthBySource: Record<string, ConnectionHealthState>;
  statusBySource: Record<string, ChatAdapterStatus>;
  moderatorBySource: Record<string, boolean>;
  setConnectionHealthBySource: (
    updater: Updater<Record<string, ConnectionHealthState>>,
  ) => void;
  setStatusBySource: (updater: Updater<Record<string, ChatAdapterStatus>>) => void;
  setModeratorBySource: (updater: Updater<Record<string, boolean>>) => void;
  resetConnectionState: () => void;
};

const applyUpdater = <T>(previous: T, updater: Updater<T>): T =>
  typeof updater === "function"
    ? (updater as (previousState: T) => T)(previous)
    : updater;

export const useConnectionStore = create<ConnectionStoreState>((set) => ({
  connectionHealthBySource: {},
  statusBySource: {},
  moderatorBySource: {},
  setConnectionHealthBySource: (updater) =>
    set((state) => ({
      connectionHealthBySource: applyUpdater(
        state.connectionHealthBySource,
        updater,
      ),
    })),
  setStatusBySource: (updater) =>
    set((state) => ({
      statusBySource: applyUpdater(state.statusBySource, updater),
    })),
  setModeratorBySource: (updater) =>
    set((state) => ({
      moderatorBySource: applyUpdater(state.moderatorBySource, updater),
    })),
  resetConnectionState: () =>
    set({
      connectionHealthBySource: {},
      statusBySource: {},
      moderatorBySource: {},
    }),
}));
