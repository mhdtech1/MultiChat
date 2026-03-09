import { beforeEach, describe, expect, it } from "vitest";
import { useUIStore } from "../../../src/renderer/store";

describe("useUIStore", () => {
  beforeEach(() => {
    useUIStore.getState().resetUiState();
  });

  it("supports direct and functional boolean updates", () => {
    useUIStore.getState().setMainMenuOpen(true);
    useUIStore.getState().setMainMenuOpen((previous) => !previous);
    useUIStore.getState().setCommandPaletteOpen(true);

    const state = useUIStore.getState();
    expect(state.mainMenuOpen).toBe(false);
    expect(state.commandPaletteOpen).toBe(true);
  });

  it("resets all ui flags", () => {
    useUIStore.getState().setQuickTourOpen(true);
    useUIStore.getState().setSetupWizardOpen(true);

    useUIStore.getState().resetUiState();
    const state = useUIStore.getState();
    expect(state.quickTourOpen).toBe(false);
    expect(state.setupWizardOpen).toBe(false);
    expect(state.mainMenuOpen).toBe(false);
    expect(state.commandPaletteOpen).toBe(false);
  });
});
