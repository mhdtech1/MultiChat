import { describe, expect, it } from "vitest";
import {
  isAllowedRedirectUri,
  loadBrokerConfig,
  parseKickExchangeRequest,
  parseKickRefreshRequest,
} from "../src/config.js";

describe("kick broker config", () => {
  it("loads config with sane defaults", () => {
    const config = loadBrokerConfig({
      KICK_CLIENT_ID: "kick-client",
      KICK_CLIENT_SECRET: "kick-secret",
    });

    expect(config.port).toBe(3001);
    expect(config.host).toBe("127.0.0.1");
    expect(config.allowedRedirectPrefixes).toEqual([
      "http://localhost:51730/",
      "http://127.0.0.1:51730/",
    ]);
    expect(config.allowedOrigins).toEqual([]);
    expect(config.maxBodyBytes).toBe(8 * 1024);
    expect(config.rateLimitWindowMs).toBe(60_000);
    expect(config.rateLimitMaxRequests).toBe(60);
  });

  it("uses hosted defaults when PORT is provided", () => {
    const config = loadBrokerConfig({
      KICK_CLIENT_ID: "kick-client",
      KICK_CLIENT_SECRET: "kick-secret",
      PORT: "10000",
    });

    expect(config.port).toBe(10000);
    expect(config.host).toBe("0.0.0.0");
  });

  it("accepts localhost redirect URIs only when configured", () => {
    expect(
      isAllowedRedirectUri("http://localhost:51730/kick/callback", [
        "http://localhost:51730/",
      ]),
    ).toBe(true);
    expect(
      isAllowedRedirectUri("https://evil.example.com/kick/callback", [
        "http://localhost:51730/",
      ]),
    ).toBe(false);
  });

  it("normalizes configured allowed origins", () => {
    const config = loadBrokerConfig({
      KICK_CLIENT_ID: "kick-client",
      KICK_CLIENT_SECRET: "kick-secret",
      KICK_BROKER_ALLOWED_ORIGINS:
        "https://app.example.com, http://localhost:3000",
    });

    expect(config.allowedOrigins).toEqual([
      "https://app.example.com",
      "http://localhost:3000",
    ]);
  });

  it("validates exchange requests", () => {
    expect(
      parseKickExchangeRequest({
        code: "abc",
        clientId: "client",
        redirectUri: "http://localhost:51730/kick/callback",
        codeVerifier: "verifier",
      }),
    ).toEqual({
      code: "abc",
      clientId: "client",
      redirectUri: "http://localhost:51730/kick/callback",
      codeVerifier: "verifier",
    });
  });

  it("validates refresh requests", () => {
    expect(
      parseKickRefreshRequest({
        refreshToken: "refresh",
        clientId: "client",
      }),
    ).toEqual({
      refreshToken: "refresh",
      clientId: "client",
    });
  });
});
