import { useEffect, useState } from "react";
import { useServerNow } from "./useServerNow";

/** Seconds remaining until `endsAt` (epoch ms). null when inactive. */
export function useCountdownEndsAt(
  endsAt: number | null | undefined,
  serverTime?: number
): number | null {
  const now = useServerNow(serverTime, endsAt != null);
  const [remaining, setRemaining] = useState<number | null>(() => calc(endsAt, now));

  useEffect(() => {
    if (endsAt == null) {
      setRemaining(null);
      return;
    }
    const next = calc(endsAt, now);
    setRemaining(next);
  }, [endsAt, now]);

  return remaining;
}

function calc(endsAt: number | null | undefined, now: number): number | null {
  if (endsAt == null) return null;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}
