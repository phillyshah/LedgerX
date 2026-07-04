import { useEffect, useRef } from 'react';

export interface DeepLinkTarget {
  type: 'estimate' | 'invoice';
  id: string;
}

// A uuid, loosely — enough to reject junk query strings without being strict.
const UUID_RE = /^[0-9a-fA-F-]{16,40}$/;

/**
 * Reads a deep-link target out of the URL query string once on mount and hands
 * it to `onTarget`, then strips the param so a refresh or share doesn't re-open
 * the record. Powers the links in notification emails (e.g.
 * `https://ledger.90ten.life/?estimate=<id>`), reusing the same in-app
 * deep-link machinery the notification bell already drives.
 *
 * Mounted only inside the authenticated shells (Dashboard / AdminLayout), so by
 * the time it runs the user is signed in and the target list can open the row.
 */
export function useInitialDeepLink(onTarget: (t: DeepLinkTarget) => void): void {
  // Guard against React StrictMode's double-invoke and re-renders — we only ever
  // want to consume the URL param once per page load.
  const consumed = useRef(false);

  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;

    let params: URLSearchParams;
    try {
      params = new URLSearchParams(window.location.search);
    } catch {
      return;
    }

    const estimateId = params.get('estimate');
    const invoiceId = params.get('invoice');
    const target: DeepLinkTarget | null =
      estimateId && UUID_RE.test(estimateId)
        ? { type: 'estimate', id: estimateId }
        : invoiceId && UUID_RE.test(invoiceId)
          ? { type: 'invoice', id: invoiceId }
          : null;

    if (!target) return;

    // Strip the deep-link params from the URL, preserving anything else.
    params.delete('estimate');
    params.delete('invoice');
    const qs = params.toString();
    const newUrl = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
    try { window.history.replaceState(null, '', newUrl); } catch { /* ignore */ }

    onTarget(target);
    // Run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
