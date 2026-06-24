import { useEffect, useRef, useState } from "react";

/**
 * Tween a number from its previous value to `target` over `duration` ms whenever `trigger` changes.
 * Used for the live counters so the collapse reads as motion, not a number snapping into place.
 */
export function useCountUp(target: number, trigger: number, duration = 2600): number {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (target - from) * eased;
      setValue(next);
      if (t < 1) raf = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  return value;
}
