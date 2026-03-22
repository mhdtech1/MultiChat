# Kick Broker

Small token broker for Chatrix Kick OAuth.

## Why it exists

Kick still requires a `client_secret` for token exchange and refresh. This broker
keeps that secret off the desktop app and off the user's machine.

## Local run

```bash
export KICK_CLIENT_ID="..."
export KICK_CLIENT_SECRET="..."
pnpm --filter @chatrix/kick-broker build
pnpm --filter @chatrix/kick-broker start
```

Default local URL:

```text
http://127.0.0.1:3001
```

Endpoints:

- `POST /kick/exchange`
- `POST /kick/refresh`
- `GET /health`

## Render Free

This repo includes a root `render.yaml` for a free Render web service.

Required secrets in Render:

- `KICK_CLIENT_ID`
- `KICK_CLIENT_SECRET`

Optional:

- `KICK_BROKER_ALLOWED_REDIRECT_PREFIXES`

The service automatically respects Render's `PORT` environment variable and binds
to `0.0.0.0`.

## Important limitation

Render Free web services spin down after idle time, which can add a cold-start
delay during sign-in.
