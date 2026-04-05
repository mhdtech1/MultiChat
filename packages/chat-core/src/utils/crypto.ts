/**
 * Generates a random alphanumeric string using cryptographically secure random values.
 * Returns a 6-character hex string to match the behavior of `Math.random().toString(36).slice(2, 8)`.
 * However, we can simply return a UUID slice or generate hex values directly.
 * We'll use a straightforward implementation.
 */
export const generateSecureRandomString = (length: number = 6): string => {
  const array = new Uint8Array(length);
  globalThis.crypto.getRandomValues(array);
  return Array.from(array)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, length);
};

/**
 * Generates a random integer from 0 to max - 1 safely.
 */
export const generateSecureRandomInt = (max: number): number => {
  if (max <= 0 || max > 0x100000000) {
    throw new Error("Max must be between 1 and 2^32");
  }

  const array = new Uint32Array(1);
  const maxRange = 0x100000000;
  const limit = maxRange - (maxRange % max);

  let randomValue;
  do {
    globalThis.crypto.getRandomValues(array);
    randomValue = array[0];
  } while (randomValue >= limit);

  return randomValue % max;
};
