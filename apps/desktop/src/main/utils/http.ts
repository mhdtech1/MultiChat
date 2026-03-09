export async function fetchJsonOrThrow<T>(
  response: Response,
  source: string,
): Promise<T> {
  const text = await response.text();
  let parsed: unknown = {};

  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {};
    }
  }

  if (!response.ok) {
    const payload = parsed as Record<string, unknown>;
    const nested = payload.error as Record<string, unknown> | undefined;
    const message =
      (typeof payload.message === "string" && payload.message) ||
      (typeof nested?.message === "string" && nested.message) ||
      (typeof payload.error_description === "string" &&
        payload.error_description) ||
      `${source} request failed (${response.status}).`;
    throw new Error(message);
  }

  return parsed as T;
}
