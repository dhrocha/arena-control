import { useEffect, useState } from "react";

/** Seconds remaining until `endsAt` (epoch ms). null when inactive. */
export function useCountdownEndsAt(endsAt: number | null | undefined): number | null {
  const [remaining, setRemaining] = useState<number | null>(() => calc(endsAt));

  useEffect(() => {
    if (endsAt == null) {
      setRemaining(null);
      return;
    }
    setRemaining(calc(endsAt));
    const id = setInterval(() => {
      const next = calc(endsAt);
      setRemaining(next);
      if (next != null && next <= 0) clearInterval(id);
    }, 200);
    return () => clearInterval(id);
  }, [endsAt]);

  return remaining;
}

function calc(endsAt: number | null | undefined): number | null {
  if (endsAt == null) return null;
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
}
