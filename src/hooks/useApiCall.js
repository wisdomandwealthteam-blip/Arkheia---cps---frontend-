// src/hooks/useApiCall.js
import { useCallback, useState } from "react";

/**
 * Wraps an async API function with loading/error/data state, so
 * components don't each reimplement the same three-state dance.
 */
export function useApiCall(apiFn) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(
    async (...args) => {
      setLoading(true);
      setError(null);
      try {
        const result = await apiFn(...args);
        setData(result);
        return result;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [apiFn]
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return { data, error, loading, run, reset };
}
