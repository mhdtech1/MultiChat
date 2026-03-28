import { shell } from "electron";
import { describe, expect, it, vi } from "vitest";
import { openAuthInBrowser } from "../../../src/main/services/loopbackOAuth";

describe("openAuthInBrowser", () => {
  it("rejects callbacks with a mismatched oauth state before resolving", async () => {
    vi.mocked(shell.openExternal).mockResolvedValue(undefined);

    const authPromise = openAuthInBrowser(
      "https://example.com/oauth",
      "http://127.0.0.1:51991/kick/callback",
      {
        timeoutMs: 2_000,
        expectedState: "expected-state",
      },
    );
    const settledAuthPromise = authPromise.then(
      () => null,
      (error) => error,
    );

    await vi.waitFor(() => {
      expect(shell.openExternal).toHaveBeenCalledWith("https://example.com/oauth");
    });

    const response = await fetch(
      "http://127.0.0.1:51991/kick/callback?code=abc&state=wrong-state",
    );

    expect(response.status).toBe(400);
    const authError = await settledAuthPromise;
    expect(authError).toBeInstanceOf(Error);
    expect((authError as Error).message).toMatch(/state mismatched/i);
  });
});
