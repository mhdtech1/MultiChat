import keytar from "keytar";
import type { AppSettings } from "../../shared/types.js";

const SERVICE_NAME = "Chatrix";
const LEGACY_SERVICE_NAMES = ["MultiChat"];

type TokenPlatform = "twitch" | "kick" | "youtube";
type TokenKeys = { access: keyof AppSettings; refresh?: keyof AppSettings };

const PLATFORM_TOKEN_KEYS: Record<TokenPlatform, TokenKeys> = {
  twitch: { access: "twitchToken" },
  kick: { access: "kickAccessToken", refresh: "kickRefreshToken" },
  youtube: { access: "youtubeAccessToken", refresh: "youtubeRefreshToken" },
};

const PLATFORM_ACCOUNTS: Record<
  TokenPlatform,
  { access: string; refresh?: string }
> = {
  twitch: { access: "TWITCH_access_token" },
  kick: { access: "KICK_access_token", refresh: "KICK_refresh_token" },
  youtube: { access: "YOUTUBE_access_token", refresh: "YOUTUBE_refresh_token" },
};

export interface SecureStorageService {
  setToken(account: string, token: string): Promise<void>;
  getToken(account: string): Promise<string | null>;
  deleteToken(account: string): Promise<boolean>;
  getAllAccounts(): Promise<string[]>;
}

class KeytarSecureStorage implements SecureStorageService {
  private readonly cache = new Map<string, string | null>();

  private cacheLoaded = false;

  private cacheLoadPromise: Promise<void> | null = null;

  private async ensureCacheLoaded(): Promise<void> {
    if (this.cacheLoaded) return;
    if (!this.cacheLoadPromise) {
      this.cacheLoadPromise = (async () => {
        this.cache.clear();
        for (const serviceName of [SERVICE_NAME, ...LEGACY_SERVICE_NAMES]) {
          const credentials = await keytar.findCredentials(serviceName);
          for (const credential of credentials) {
            if (
              !this.cache.has(credential.account) ||
              serviceName === SERVICE_NAME
            ) {
              this.cache.set(credential.account, credential.password);
            }
          }
        }
        this.cacheLoaded = true;
      })().finally(() => {
        this.cacheLoadPromise = null;
      });
    }
    await this.cacheLoadPromise;
  }

  async setToken(account: string, token: string): Promise<void> {
    const normalized = token.trim();
    if (!normalized) {
      await this.deleteToken(account);
      return;
    }
    await this.ensureCacheLoaded();
    const cached = this.cache.get(account);
    if (cached === normalized) return;
    await keytar.setPassword(SERVICE_NAME, account, normalized);
    for (const legacyServiceName of LEGACY_SERVICE_NAMES) {
      await keytar
        .deletePassword(legacyServiceName, account)
        .catch(() => false);
    }
    this.cache.set(account, normalized);
  }

  async getToken(account: string): Promise<string | null> {
    await this.ensureCacheLoaded();
    if (!this.cache.has(account)) {
      this.cache.set(account, null);
      return null;
    }
    return this.cache.get(account) ?? null;
  }

  async deleteToken(account: string): Promise<boolean> {
    await this.ensureCacheLoaded();
    const cached = this.cache.get(account);
    if (!cached) {
      this.cache.set(account, null);
      return false;
    }
    const deletedResults = await Promise.all([
      keytar.deletePassword(SERVICE_NAME, account),
      ...LEGACY_SERVICE_NAMES.map((legacyServiceName) =>
        keytar.deletePassword(legacyServiceName, account).catch(() => false),
      ),
    ]);
    this.cache.set(account, null);
    return deletedResults.some(Boolean);
  }

  async getAllAccounts(): Promise<string[]> {
    await this.ensureCacheLoaded();
    const accounts: string[] = [];
    for (const [account, token] of this.cache.entries()) {
      if (token) {
        accounts.push(account);
      }
    }
    return accounts;
  }
}

class MemorySecureStorage implements SecureStorageService {
  private readonly store = new Map<string, string>();

  async setToken(account: string, token: string): Promise<void> {
    this.store.set(account, token);
  }

  async getToken(account: string): Promise<string | null> {
    return this.store.get(account) ?? null;
  }

  async deleteToken(account: string): Promise<boolean> {
    return this.store.delete(account);
  }

  async getAllAccounts(): Promise<string[]> {
    return Array.from(this.store.keys());
  }
}

let secureStorage: SecureStorageService | null = null;

export function getSecureStorage(): SecureStorageService {
  if (!secureStorage) {
    try {
      secureStorage = new KeytarSecureStorage();
    } catch (error) {
      console.warn("Keytar unavailable, using in-memory token storage", error);
      secureStorage = new MemorySecureStorage();
    }
  }
  return secureStorage;
}

export async function storeAuthTokens(
  platform: TokenPlatform,
  tokens: { accessToken: string; refreshToken?: string },
): Promise<void> {
  const storage = getSecureStorage();
  const accounts = PLATFORM_ACCOUNTS[platform];
  const accessToken = tokens.accessToken.trim();
  if (accessToken) {
    await storage.setToken(accounts.access, accessToken);
  } else {
    await storage.deleteToken(accounts.access);
  }
  if (accounts.refresh) {
    const refreshToken = tokens.refreshToken?.trim() ?? "";
    if (refreshToken) {
      await storage.setToken(accounts.refresh, refreshToken);
    } else {
      await storage.deleteToken(accounts.refresh);
    }
  }
}

export async function getAuthTokens(
  platform: TokenPlatform,
): Promise<{ accessToken: string | null; refreshToken: string | null }> {
  const storage = getSecureStorage();
  const accounts = PLATFORM_ACCOUNTS[platform];
  const accessToken = (await storage.getToken(accounts.access))?.trim() ?? null;
  const refreshToken = accounts.refresh
    ? ((await storage.getToken(accounts.refresh))?.trim() ?? null)
    : null;
  return {
    accessToken: accessToken || null,
    refreshToken: refreshToken || null,
  };
}

export async function clearAuthTokens(platform: TokenPlatform): Promise<void> {
  const storage = getSecureStorage();
  const accounts = PLATFORM_ACCOUNTS[platform];
  await storage.deleteToken(accounts.access);
  if (accounts.refresh) {
    await storage.deleteToken(accounts.refresh);
  }
}

type SettingsReaderWriter = {
  get<K extends keyof AppSettings>(key: K): AppSettings[K];
  set(updates: Partial<AppSettings>): void;
};

export async function hydrateTokenStateFromSecureStorage(
  store: SettingsReaderWriter,
): Promise<void> {
  const updates: Partial<AppSettings> = {};

  for (const platform of Object.keys(PLATFORM_TOKEN_KEYS) as TokenPlatform[]) {
    const keys = PLATFORM_TOKEN_KEYS[platform];
    const tokens = await getAuthTokens(platform);
    (updates as Record<string, unknown>)[keys.access] =
      tokens.accessToken ?? "";
    if (keys.refresh) {
      (updates as Record<string, unknown>)[keys.refresh] =
        tokens.refreshToken ?? "";
    }
  }

  store.set(updates);
}

export async function migrateLegacySettingsTokens(
  store: SettingsReaderWriter,
): Promise<void> {
  for (const platform of Object.keys(PLATFORM_TOKEN_KEYS) as TokenPlatform[]) {
    const keys = PLATFORM_TOKEN_KEYS[platform];
    const access = String(store.get(keys.access) ?? "").trim();
    const refresh = keys.refresh
      ? String(store.get(keys.refresh) ?? "").trim()
      : "";
    if (!access && !refresh) continue;

    const existing = await getAuthTokens(platform);
    const hasExisting = Boolean(
      existing.accessToken?.trim() || existing.refreshToken?.trim(),
    );
    if (hasExisting) continue;

    await storeAuthTokens(platform, {
      accessToken: access,
      refreshToken: refresh || undefined,
    });
  }
}
