import { shell } from "electron";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

const normalizePathname = (pathname: string) => {
  const normalized = pathname.replace(/\/+$/, "");
  return normalized === "" ? "/" : normalized;
};

const isLoopbackHost = (hostname: string) => {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
};

const sendAuthHtml = (
  response: ServerResponse<IncomingMessage>,
  statusCode: number,
  html: string,
) => {
  response.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
  });
  response.end(html);
};

const authCompletePage = `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Chatrix Sign-In Complete</title>
    <style>
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; background: #0f172a; color: #e2e8f0; display: grid; place-items: center; min-height: 100vh; }
      .card { max-width: 540px; padding: 24px; border: 1px solid #334155; border-radius: 12px; background: #111827; }
      h1 { margin: 0 0 8px; font-size: 20px; }
      p { margin: 0; line-height: 1.5; color: #cbd5e1; }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Returning to Chatrix</h1>
      <p>This tab will close automatically. If it stays open, you can close it manually.</p>
    </main>
    <script>
      (() => {
        setTimeout(() => {
          window.open("", "_self");
          window.close();
        }, 250);
      })();
    </script>
  </body>
</html>
`;

const authHashBridgePage = (_pathname: string) => `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Completing Sign-In...</title>
    <style>
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; background: #0f172a; color: #e2e8f0; display: grid; place-items: center; min-height: 100vh; }
      .card { max-width: 540px; padding: 24px; border: 1px solid #334155; border-radius: 12px; background: #111827; }
      p { margin: 0; line-height: 1.5; color: #cbd5e1; }
    </style>
  </head>
  <body>
    <main class="card">
      <p id="status">Finishing sign-in...</p>
    </main>
    <script>
      (() => {
        const status = document.getElementById("status");
        const hash = window.location.hash ? window.location.hash.slice(1) : "";
        if (!hash) {
          if (status) status.textContent = "Sign-in response was missing data. You can close this tab and try again.";
          return;
        }
        const target = ${JSON.stringify("__PATHNAME__")} + "?oauth_fragment=" + encodeURIComponent(hash);
        window.location.replace(target.replace("__PATHNAME__", ${JSON.stringify("__PATHNAME__")}));
      })();
    </script>
  </body>
</html>
`;

type OpenAuthInBrowserOptions = {
  timeoutMs: number;
  expectedState?: string;
  onComplete?: () => void;
};

const resolveCallbackState = (callbackUrl: string): string => {
  try {
    const callback = new URL(callbackUrl);
    if (callback.hash.length > 1) {
      return new URLSearchParams(callback.hash.slice(1)).get("state") ?? "";
    }
    return callback.searchParams.get("state") ?? "";
  } catch {
    return "";
  }
};

export const openAuthInBrowser = async (
  authUrl: string,
  redirectUri: string,
  options: OpenAuthInBrowserOptions,
): Promise<string> => {
  const redirect = new URL(redirectUri);

  if (redirect.protocol !== "http:") {
    throw new Error("OAuth redirect URI must use http:// for desktop sign-in.");
  }
  if (!isLoopbackHost(redirect.hostname)) {
    throw new Error(
      "OAuth redirect URI must use localhost or loopback for desktop sign-in.",
    );
  }

  const callbackPath = normalizePathname(redirect.pathname);
  const callbackPort = Number.parseInt(redirect.port || "80", 10);

  return new Promise((resolve, reject) => {
    let settled = false;

    const server = createServer((request, response) => {
      const incoming = new URL(request.url ?? "/", redirect.origin);
      const incomingPath = normalizePathname(incoming.pathname);
      const oauthFragment = incoming.searchParams.get("oauth_fragment");
      const hasDirectCallbackParams =
        incoming.searchParams.has("code") ||
        incoming.searchParams.has("error") ||
        incoming.searchParams.has("state");
      const isExpectedPath = incomingPath === callbackPath;
      const hasOAuthPayload =
        Boolean(oauthFragment && oauthFragment.length > 0) ||
        hasDirectCallbackParams;

      if (!isExpectedPath && !hasOAuthPayload) {
        sendAuthHtml(response, 404, "<h1>Not found</h1>");
        return;
      }

      if (oauthFragment && oauthFragment.length > 0) {
        const callbackUrl = `${redirect.origin}${incoming.pathname}#${oauthFragment}`;
        if (
          options.expectedState &&
          resolveCallbackState(callbackUrl) !== options.expectedState
        ) {
          sendAuthHtml(response, 400, "<h1>Invalid OAuth state</h1>");
          finish(
            undefined,
            new Error(
              "Sign-in was rejected because the OAuth state mismatched.",
            ),
          );
          return;
        }
        sendAuthHtml(response, 200, authCompletePage);
        finish(callbackUrl);
        return;
      }

      if (hasDirectCallbackParams) {
        const callbackUrl = `${redirect.origin}${incoming.pathname}${incoming.search}`;
        if (
          options.expectedState &&
          resolveCallbackState(callbackUrl) !== options.expectedState
        ) {
          sendAuthHtml(response, 400, "<h1>Invalid OAuth state</h1>");
          finish(
            undefined,
            new Error(
              "Sign-in was rejected because the OAuth state mismatched.",
            ),
          );
          return;
        }
        sendAuthHtml(response, 200, authCompletePage);
        finish(callbackUrl);
        return;
      }

      sendAuthHtml(
        response,
        200,
        authHashBridgePage(incoming.pathname).replaceAll(
          '"__PATHNAME__"',
          JSON.stringify(incoming.pathname),
        ),
      );
    });

    const timeout = setTimeout(() => {
      finish(undefined, new Error("Sign-in timed out. Please try again."));
    }, options.timeoutMs);

    const closeServer = () => {
      clearTimeout(timeout);
      server.removeAllListeners("error");
      server.close();
    };

    const finish = (callbackUrl?: string, error?: Error) => {
      if (settled) return;
      settled = true;
      closeServer();
      options.onComplete?.();
      if (error) {
        reject(error);
        return;
      }
      resolve(callbackUrl ?? "");
    };

    server.on("error", (error) => {
      const text = error instanceof Error ? error.message : String(error);
      finish(
        undefined,
        new Error(`Unable to listen for OAuth callback: ${text}`),
      );
    });

    server.listen(callbackPort, "127.0.0.1", () => {
      void shell.openExternal(authUrl).catch((error) => {
        finish(
          undefined,
          new Error(`Failed to open default browser: ${String(error)}`),
        );
      });
    });
  });
};
