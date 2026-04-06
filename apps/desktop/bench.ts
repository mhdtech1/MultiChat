const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
};

const getTwitchBadgeEntries = (message: any) => {
  const raw = asRecord(message.raw);
  if (Array.isArray(raw?.parsedBadges)) {
    return raw.parsedBadges as { setId: string; versionId: string; key: string }[];
  }
  return [];
};

const message = {
  badges: ["broadcaster/1", "subscriber/0", "premium/1"],
  raw: {
    badges: "broadcaster/1,subscriber/0,premium/1",
    parsedBadges: [
      { setId: "broadcaster", versionId: "1", key: "broadcaster/1" },
      { setId: "subscriber", versionId: "0", key: "subscriber/0" },
      { setId: "premium", versionId: "1", key: "premium/1" }
    ]
  }
};

const ITERATIONS = 100000;
const start = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  getTwitchBadgeEntries(message);
}
const end = performance.now();
console.log(`Optimized benchmark: ${(end - start).toFixed(2)} ms`);
