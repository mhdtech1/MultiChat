import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { BrokerConfig } from "../src/config.js";
import { createKickBrokerServer } from "../src/server.js";

const baseConfig: BrokerConfig = {
  port: 3001,
  host: "127.0.0.1",
  kickClientId: "kick-client",
  kickClientSecret: "kick-secret",
  allowedRedirectPrefixes: ["http://localhost:51730/"],
  allowedOrigins: [],
  maxBodyBytes: 8 * 1024,
  rateLimitWindowMs: 60_000,
  rateLimitMaxRequests: 60,
};

const activeServers = new Set<Server>();

const startServer = async (overrides: Partial<BrokerConfig> = {}) => {
  const server = createKickBrokerServer({
    ...baseConfig,
    ...overrides,
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  activeServers.add(server);
  const address = server.address() as AddressInfo;
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
};

afterEach(async () => {
  await Promise.all(
    [...activeServers].map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
  activeServers.clear();
});

describe("kick broker server", () => {
  it("rejects oversized request bodies", async () => {
    const { baseUrl } = await startServer({
      maxBodyBytes: 64,
    });

    const response = await fetch(`${baseUrl}/kick/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientId: "kick-client",
        refreshToken: "x".repeat(200),
      }),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "request_body_too_large",
    });
  });

  it("rejects browser origins that are not explicitly allowed", async () => {
    const { baseUrl } = await startServer({
      allowedOrigins: ["https://app.example.com"],
    });

    const response = await fetch(`${baseUrl}/health`, {
      headers: {
        Origin: "https://evil.example.com",
      },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_origin",
    });
  });

  it("applies per-ip rate limits before processing broker requests", async () => {
    const { baseUrl } = await startServer({
      rateLimitMaxRequests: 1,
      rateLimitWindowMs: 60_000,
    });

    const requestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientId: "kick-client",
      }),
    } satisfies RequestInit;

    const first = await fetch(`${baseUrl}/kick/refresh`, requestInit);
    expect(first.status).toBe(400);

    const second = await fetch(`${baseUrl}/kick/refresh`, requestInit);
    expect(second.status).toBe(429);
    await expect(second.json()).resolves.toEqual({
      error: "rate_limit_exceeded",
    });
  });
});
