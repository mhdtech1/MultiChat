import { vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "/mock/path"),
    isPackaged: false,
    requestSingleInstanceLock: vi.fn(() => true),
    on: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
    quit: vi.fn(),
    focus: vi.fn()
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    on: vi.fn(),
    webContents: {
      send: vi.fn(),
      setWindowOpenHandler: vi.fn()
    },
    getBounds: vi.fn(() => ({ x: 0, y: 0, width: 800, height: 600 })),
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    restore: vi.fn(),
    focus: vi.fn(),
    show: vi.fn(),
    close: vi.fn(),
    setMovable: vi.fn(),
    setResizable: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    setVisibleOnAllWorkspaces: vi.fn(),
    setIgnoreMouseEvents: vi.fn()
  })),
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn()
  },
  shell: {
    openExternal: vi.fn()
  },
  contextBridge: {
    exposeInMainWorld: vi.fn()
  },
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn()
  },
  session: {
    fromPartition: vi.fn(() => ({}))
  },
  Menu: {
    buildFromTemplate: vi.fn(),
    setApplicationMenu: vi.fn()
  },
  dialog: {
    showMessageBox: vi.fn()
  }
}));

const mockElectronAPI = {
  getSettings: vi.fn(() => Promise.resolve({})),
  setSettings: vi.fn(() => Promise.resolve({})),
  signInTwitch: vi.fn(() => Promise.resolve({})),
  signOutTwitch: vi.fn(() => Promise.resolve({})),
  signInKick: vi.fn(() => Promise.resolve({})),
  configureKickLocalAuth: vi.fn(() => Promise.resolve({})),
  signOutKick: vi.fn(() => Promise.resolve({})),
  checkForUpdates: vi.fn(() => Promise.resolve({ state: "idle", message: "", channel: "stable", currentVersion: "0.0.0" }))
};

Object.defineProperty(window, "electronAPI", {
  value: mockElectronAPI,
  writable: true
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});
