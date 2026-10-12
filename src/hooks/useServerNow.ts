import { useEffect, useState } from "react";

export function useServerNow(serverTime?: number, enabled = true): number {
  const [now, setNow] = useState(() => serverTime ?? Date.now());

  useEffect(() => {
    const baseTime = serverTime ?? Date.now();
    setNow(baseTime);
    if (!enabled) return;

    const basePerformance = performance.now();
    const id = setInterval(() => {
      setNow(baseTime + performance.now() - basePerformance);
    }, 200);
    return () => clearInterval(id);
  }, [serverTime, enabled]);

  return now;
}