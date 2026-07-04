/**
 * CollapsibleSection
 *
 * Light wrapper that gives any dashboard section a collapse/expand
 * chevron. State is persisted per-section in localStorage so the
 * user's choice survives navigation and reloads — granularity is
 * intentionally per-device, not per-account, since this is purely
 * a viewing preference.
 *
 * Pass a stable `storageKey` for each section. Default state is
 * expanded; the chevron rotates 180° when collapsed.
 */

import { ReactNode, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface Props {
  /** Stable id for localStorage. Use the section's semantic name, e.g. "inbox". */
  storageKey: string;
  /** Section title — shown next to the chevron. */
  title: string;
  /** Optional icon to render to the left of the title. */
  icon?: ReactNode;
  /** Optional small text rendered to the right of the title (e.g. counts). */
  meta?: ReactNode;
  /** Whether to start expanded if no preference is stored. Default true. */
  defaultExpanded?: boolean;
  /** When true, render nothing at all. Useful for "auto-hide empty sections". */
  hidden?: boolean;
  /**
   * Increment this to force the section open (e.g. deep-linking a notification
   * into a collapsed section so its content mounts). Any change to a truthy
   * value expands; the user can still collapse again afterward.
   */
  expandSignal?: number;
  children: ReactNode;
}

const KEY_PREFIX = 'ledgerx:collapse:';

function readStored(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + key);
    if (raw === null) return fallback;
    return raw === '1';
  } catch {
    return fallback;
  }
}

function writeStored(key: string, expanded: boolean): void {
  try {
    window.localStorage.setItem(KEY_PREFIX + key, expanded ? '1' : '0');
  } catch {
    /* no-op */
  }
}

export function CollapsibleSection({
  storageKey,
  title,
  icon,
  meta,
  defaultExpanded = true,
  hidden = false,
  expandSignal = 0,
  children,
}: Props) {
  const [expanded, setExpanded] = useState<boolean>(() =>
    readStored(storageKey, defaultExpanded),
  );

  useEffect(() => {
    writeStored(storageKey, expanded);
  }, [storageKey, expanded]);

  // Force open when the host bumps expandSignal (e.g. a deep-link needs this
  // section's content mounted). Skip the initial 0 so we don't override the
  // user's stored collapsed preference on mount.
  useEffect(() => {
    if (expandSignal > 0) setExpanded(true);
  }, [expandSignal]);

  if (hidden) return null;

  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-2 py-1.5 -mx-2 rounded-lg hover:bg-white/60 transition-colors group"
        aria-expanded={expanded}
      >
        {icon && <span className="flex-shrink-0 text-slate-500">{icon}</span>}
        <h3 className="text-sm font-semibold text-slate-700 truncate tracking-tight">{title}</h3>
        {meta && <span className="text-xs font-medium text-slate-400 flex-shrink-0">{meta}</span>}
        <span className="flex-1" />
        <ChevronDown
          className={`w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-transform ${
            expanded ? '' : '-rotate-90'
          }`}
        />
      </button>
      {expanded && <div>{children}</div>}
    </section>
  );
}
