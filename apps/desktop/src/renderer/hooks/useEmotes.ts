import { useMemo } from "react";

type EmoteMap = Record<string, string>;

export function useEmotes(globalEmotes: EmoteMap = {}) {
  const resolveEmote = useMemo(() => {
    return (token: string) => globalEmotes[token];
  }, [globalEmotes]);

  return {
    resolveEmote,
  };
}
