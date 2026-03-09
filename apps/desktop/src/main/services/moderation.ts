import type { ModerationRequest } from "../../shared/types.js";

export function assertModerationPayload(
  payload: ModerationRequest,
): asserts payload is Required<
  Pick<ModerationRequest, "platform" | "channel" | "action">
> &
  ModerationRequest {
  if (!payload.platform) {
    throw new Error("Moderation platform is required.");
  }
  if (!payload.channel) {
    throw new Error("Moderation channel is required.");
  }
  if (!payload.action) {
    throw new Error("Moderation action is required.");
  }
}
