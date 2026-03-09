import { create } from "zustand";

type Updater<T> = T | ((previous: T) => T);

type UiStoreState = {
  commandPaletteOpen: boolean;
  mainMenuOpen: boolean;
  quickTourOpen: boolean;
  setupWizardOpen: boolean;
  setCommandPaletteOpen: (updater: Updater<boolean>) => void;
  setMainMenuOpen: (updater: Updater<boolean>) => void;
  setQuickTourOpen: (updater: Updater<boolean>) => void;
  setSetupWizardOpen: (updater: Updater<boolean>) => void;
  resetUiState: () => void;
};

const applyUpdater = <T>(previous: T, updater: Updater<T>): T =>
  typeof updater === "function"
    ? (updater as (previousState: T) => T)(previous)
    : updater;

export const useUIStore = create<UiStoreState>((set) => ({
  commandPaletteOpen: false,
  mainMenuOpen: false,
  quickTourOpen: false,
  setupWizardOpen: false,
  setCommandPaletteOpen: (updater) =>
    set((state) => ({
      commandPaletteOpen: applyUpdater(state.commandPaletteOpen, updater),
    })),
  setMainMenuOpen: (updater) =>
    set((state) => ({
      mainMenuOpen: applyUpdater(state.mainMenuOpen, updater),
    })),
  setQuickTourOpen: (updater) =>
    set((state) => ({
      quickTourOpen: applyUpdater(state.quickTourOpen, updater),
    })),
  setSetupWizardOpen: (updater) =>
    set((state) => ({
      setupWizardOpen: applyUpdater(state.setupWizardOpen, updater),
    })),
  resetUiState: () =>
    set({
      commandPaletteOpen: false,
      mainMenuOpen: false,
      quickTourOpen: false,
      setupWizardOpen: false,
    }),
}));
