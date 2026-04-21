import { useEffect, useRef, useState } from 'react';
import { X, Search, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface NPIResult {
  npi: string;
  name: string;
  credential?: string;
  specialty?: string;
  city?: string;
  state?: string;
}

interface NPILookupModalProps {
  onClose: () => void;
  onInsert: (text: string) => void;
}

export function NPILookupModal({ onClose, onInsert }: NPILookupModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NPIResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      runSearch(q);
    }, 400);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query]);

  const runSearch = async (q: string) => {
    setLoading(true);
    setError('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('lookup-npi', {
        body: { query: q },
      });
      if (fnError) throw fnError;
      setResults((data?.results ?? []) as NPIResult[]);
      setHasSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lookup failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInsert = (r: NPIResult) => {
    const credential = r.credential ? `, ${r.credential}` : '';
    onInsert(`Surgeon: Dr. ${r.name}${credential}, NPI: ${r.npi}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[85vh] bg-green-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-green-700">
          <h2 className="text-lg font-bold text-white">Surgeon NPI Lookup</h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-green-700 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-green-300" />
          </button>
        </div>

        <div className="px-5 py-4 border-b border-green-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by last name or 'First Last'"
              className="w-full pl-9 pr-10 py-2.5 bg-white rounded-xl text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {loading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-600 animate-spin" />
            )}
          </div>
          <p className="text-xs text-green-300 mt-2">
            Powered by the CMS NPPES registry.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {error && (
            <div className="mx-2 my-2 p-3 bg-red-900 border border-red-700 rounded-xl">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {!error && !loading && hasSearched && results.length === 0 && (
            <p className="text-sm text-green-300 text-center py-8">No results found.</p>
          )}

          {!error && !hasSearched && query.trim().length < 2 && (
            <p className="text-sm text-green-400/70 text-center py-8">
              Type at least 2 characters to search.
            </p>
          )}

          <ul className="space-y-1.5">
            {results.map((r) => (
              <li key={r.npi}>
                <button
                  type="button"
                  onClick={() => handleInsert(r)}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-green-700/60 transition-colors border border-green-700/50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate">
                        {r.name}{r.credential ? `, ${r.credential}` : ''}
                      </p>
                      {r.specialty && (
                        <p className="text-xs text-green-200 truncate">{r.specialty}</p>
                      )}
                      {(r.city || r.state) && (
                        <p className="text-xs text-green-400 truncate">
                          {[r.city, r.state].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-green-300">NPI</p>
                      <p className="text-sm font-mono font-semibold text-green-100">{r.npi}</p>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="px-5 py-3 border-t border-green-700 text-center">
          <p className="text-xs text-green-400">
            Click a result to insert it into the notes.
          </p>
        </div>
      </div>
    </div>
  );
}
