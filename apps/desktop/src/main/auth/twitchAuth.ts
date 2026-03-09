import crypto from "node:crypto";
import http from "node:http";
import { shell } from "electron";
import { AUTH } from "../../shared/constants.js";

type TwitchTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

type TwitchUserResponse = {
  data?: Array<{
    id: string;
    login: string;
  }>;
};

export type TwitchAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
};

export type TwitchAuthResult = {
  accessToken: string;
  refreshToken: string;
  userId: string;
  username: string;
  expiresIn: number;
};

export class TwitchAuthService {
  private readonly config: TwitchAuthConfig;
  private server: http.Server | null = null;
  private pendingState: string | null = null;

  constructor(config: TwitchAuthConfig) {
    this.config = config;
  }

  async signIn(): Promise<TwitchAuthResult> {
    return new Promise((resolve, reject) => {
      const state = crypto.randomBytes(16).toString("hex");
      this.pendingState = state;

      const timeout = setTimeout(() => {
        this.cleanup();
        reject(new Error("OAuth timeout"));
      }, AUTH.OAUTH_CALLBACK_TIMEOUT_MS);

      this.server = http.createServer(async (req, res) => {
        const url = new URL(
          req.url ?? "/",
          `http://localhost:${AUTH.OAUTH_HTTP_PORT}`,
        );
        if (url.pathname !== "/twitch/callback") {
          res.writeHead(404);
          res.end("Not found");
          return;
        }

        const code = url.searchParams.get("code");
        const receivedState = url.searchParams.get("state");
        if (!code || receivedState !== this.pendingState) {
          clearTimeout(timeout);
          this.cleanup();
          res.writeHead(400);
          res.end("Invalid callback");
          reject(new Error("Invalid OAuth callback"));
          return;
        }

        try {
          const tokens = await this.exchangeCode(code);
          const user = await this.fetchUser(tokens.access_token);
          clearTimeout(timeout);
          this.cleanup();
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(
            "<html><body><h1>Signed in</h1><script>window.close()</script></body></html>",
          );
          resolve({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            userId: user.id,
            username: user.login,
            expiresIn: tokens.expires_in,
          });
        } catch (error) {
          clearTimeout(timeout);
          this.cleanup();
          res.writeHead(500);
          res.end("Authentication failed");
          reject(error);
        }
      });

      this.server.listen(AUTH.OAUTH_HTTP_PORT, "127.0.0.1", () => {
        void shell.openExternal(this.buildAuthUrl(state));
      });
      this.server.on("error", (error) => {
        clearTimeout(timeout);
        this.cleanup();
        reject(error);
      });
    });
  }

  async refreshToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const response = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.status}`);
    }
    const data = (await response.json()) as TwitchTokenResponse;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  private buildAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: this.config.scopes.join(" "),
      state,
    });
    return `https://id.twitch.tv/oauth2/authorize?${params}`;
  }

  private async exchangeCode(code: string): Promise<TwitchTokenResponse> {
    const response = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: this.config.redirectUri,
      }),
    });
    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.status}`);
    }
    return (await response.json()) as TwitchTokenResponse;
  }

  private async fetchUser(
    accessToken: string,
  ): Promise<{ id: string; login: string }> {
    const response = await fetch("https://api.twitch.tv/helix/users", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-Id": this.config.clientId,
      },
    });
    if (!response.ok) {
      throw new Error(`User fetch failed: ${response.status}`);
    }
    const data = (await response.json()) as TwitchUserResponse;
    const user = data.data?.[0];
    if (!user) {
      throw new Error("No user data returned");
    }
    return user;
  }

  private cleanup(): void {
    this.pendingState = null;
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
