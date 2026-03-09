import type { UpdateStatus } from "../../shared/types.js";

export const createInitialUpdateStatus = (
  currentVersion: string,
  channel: "stable" | "beta",
): UpdateStatus => ({
  state: "idle",
  message: "Checking for updates shortly...",
  channel,
  currentVersion,
});
