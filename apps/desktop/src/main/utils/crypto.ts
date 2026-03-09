import crypto from "node:crypto";

export const randomToken = (bytes = 32): string =>
  crypto.randomBytes(bytes).toString("base64url");
