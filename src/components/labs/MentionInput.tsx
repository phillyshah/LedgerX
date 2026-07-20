import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

export interface Mentionable {
  uid: string;
  username: string;
  hint: string;
}

interface MentionInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * A textarea with a lightweight @mention autocomplete. Typing "@" opens a
 * dropdown of mentionable users (Labs admins + receipt submitters, from the
 * reconciliation_mentionable RPC); picking one inserts the canonical
 * @username so the stored body always resolves. Enter submits; Shift+Enter
 * newlines. When the dropdown is open, ↑/↓/Enter navigate it instead.
 */
export function MentionInput({ value, onChange, onSubmit, placeholder, disabled }: MentionInputProps) {
  const [people, setPeople] = useState<Mentionable[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Load the mentionable set once (small; admins + flagged-household submitters).
  useEffect(() => {
    supabase.rpc('reconciliation_mentionable').then(({ data }) => {
      setPeople((data ?? []) as Mentionable[]);
    });
  }, []);

  const matches = open
    ? people
        .filter((p) => p.username.toLowerCase().startsWith(query.toLowerCase()))
        .slice(0, 6)
    : [];

  // Recompute the @-fragment immediately before the caret.
  const syncMentionState = (text: string, caret: number) => {
    const upto = text.slice(0, caret);
    const m = /(?:^|\s)@([A-Za-z0-9_]*)$/.exec(upto);
    if (m) {
      setOpen(true);
      setQuery(m[1]);
      setActive(0);
    } else {
      setOpen(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    syncMentionState(e.target.value, e.target.selectionStart ?? e.target.value.length);
  };

  const pick = (p: Mentionable) => {
    const ta = taRef.current;
    const caret = ta?.selectionStart ?? value.length;
    const upto = value.slice(0, caret);
    const rest = value.slice(caret);
    const replaced = upto.replace(/@([A-Za-z0-9_]*)$/, `@${p.username} `);
    const next = replaced + rest;
    onChange(next);
    setOpen(false);
    // Restore focus + caret after the inserted handle.
    requestAnimationFrame(() => {
      ta?.focus();
      const pos = replaced.length;
      ta?.setSelectionRange(pos, pos);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && matches.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % matches.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + matches.length) % matches.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(matches[active]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="relative">
      <textarea
        ref={taRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={2}
        className="w-full resize-none px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-50"
      />
      {open && matches.length > 0 && (
        <div className="absolute left-0 bottom-full mb-1 w-64 max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg z-10">
          {matches.map((p, i) => (
            <button
              key={p.uid}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(p); }}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                i === active ? 'bg-emerald-50' : 'hover:bg-slate-50'
              }`}
            >
              <span className="font-medium text-slate-900">@{p.username}</span>
              <span className="text-[10px] text-slate-400 uppercase tracking-wide">{p.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
