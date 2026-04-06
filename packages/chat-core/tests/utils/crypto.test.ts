import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateSecureRandomInt,
  generateSecureRandomString,
} from "../../src/utils/crypto";

describe("crypto utils", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("generates a hex string of the requested length", () => {
    const getRandomValues = vi.fn((values: Uint8Array) => {
      values.set([0xab, 0xcd, 0xef]);
      return values;
    });
    vi.stubGlobal("crypto", { getRandomValues });

    expect(generateSecureRandomString(5)).toBe("abcde");
    expect(getRandomValues).toHaveBeenCalledOnce();
  });

  it("rejects invalid string lengths", () => {
    expect(() => generateSecureRandomString(0)).toThrow(
      "Length must be a positive integer.",
    );
  });

  it("retries when a random value would introduce modulo bias", () => {
    const getRandomValues = vi
      .fn()
      .mockImplementationOnce((values: Uint32Array) => {
        values[0] = 0xffffffff;
        return values;
      })
      .mockImplementationOnce((values: Uint32Array) => {
        values[0] = 1234567890;
        return values;
      });
    vi.stubGlobal("crypto", { getRandomValues });

    expect(generateSecureRandomInt(100000)).toBe(67890);
    expect(getRandomValues).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid integer ranges", () => {
    expect(() => generateSecureRandomInt(0)).toThrow(
      "Max must be an integer between 1 and 2^32.",
    );
    expect(() => generateSecureRandomInt(1.5)).toThrow(
      "Max must be an integer between 1 and 2^32.",
    );
  });
});
