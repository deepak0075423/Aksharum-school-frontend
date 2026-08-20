import { useState, useEffect, useCallback } from 'react';

/**
 * `data` is the payload — `res.data` when the response is wrapped, otherwise
 * the response itself.
 *
 * `meta` is the rest of the envelope, and exists because an endpoint that
 * paginates flat — `{ success, data: [...], total, page, pages }` — used to
 * lose its page count here: `data` became the array and every caller testing
 * `data.pages` read undefined, so the pager never rendered and nothing past
 * page one was reachable. Read paging from `meta`, not from `data`.
 */
export default function useFetch(fetcher, deps = []) {
  const [data,    setData]    = useState(null);
  const [meta,    setMeta]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetcher();
      setData(res?.data ?? res);
      setMeta(res && typeof res === 'object' && !Array.isArray(res) ? res : null);
    } catch (err) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => { load(); }, [load]);

  return { data, meta, loading, error, refetch: load };
}
