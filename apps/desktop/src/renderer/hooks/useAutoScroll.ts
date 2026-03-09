import { useCallback, useRef, useState } from "react";

const SCROLL_THRESHOLD_PX = 100;

export function useAutoScroll() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const distance =
      container.scrollHeight - (container.scrollTop + container.clientHeight);
    setIsAtBottom(distance <= SCROLL_THRESHOLD_PX);
  }, []);

  const scrollToBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    setIsAtBottom(true);
  }, []);

  return {
    containerRef,
    isAtBottom,
    handleScroll,
    scrollToBottom,
  };
}
