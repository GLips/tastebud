import { useEffect, useState } from "react";

/** "5m ago" only needs minute precision, so the clock ticks well under that. */
const REVIEW_CLOCK_TICK_MS = 15_000;

/** The current time for relative timestamps, re-read on a tick so render stays pure. */
export function useReviewClockMs(): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), REVIEW_CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return nowMs;
}
