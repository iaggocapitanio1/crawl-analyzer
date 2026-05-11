import { useEffect, useRef } from 'react';

/**
 * Runs `callback` once immediately, then repeatedly at `intervalMs`.
 * Returns a cleanup-aware hook — the interval is cleared when the
 * consuming component unmounts or when `enabled` flips to false.
 */
export function usePolling(
  callback: () => void,
  intervalMs: number,
  enabled: boolean = true,
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;
    callbackRef.current();
    const id = setInterval(() => callbackRef.current(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
}
