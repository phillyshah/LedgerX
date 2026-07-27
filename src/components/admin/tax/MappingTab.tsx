import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Plus, Trash2, Check, X, Pencil, Info,
  EyeOff, Eye, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useT } from '../../../hooks/useT';
import type { ScheduleELineRow } from '../../../lib/scheduleE';

interface CategoryMapping {
  category_id: string;
  category_name: string;
  line_id: string | null;
  line_code: string | null;
  line_label: string | null;
  txn_count: number;
}

const field = 'text-sm bg-white border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900';

/**
 * Where the two worlds meet — and the only place they touch.
 *
 * The left half maps each *operational* category (what contractors actually
 * pick when submitting) to a tax line. The right half manages the tax lines
 * themselves. Neither one modifies the `categories` table: the mapping lives
 * in its own join table, so renaming or deleting a tax line never disturbs
 * day-to-day categorization, and vice versa.
 */
export function MappingTab() {
  const { t } = useT();
  const [lines, setLines] = useState<ScheduleELineRow[]>([]);
  const [mappings, setMappings] = useState<CategoryMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [linesRes, mapRes] = await Promise.all([
      supabase.rpc('list_schedule_e_lines', { p_include_inactive: true }),
      supabase.rpc('list_category_mappings'),
    ]);
    if (linesRes.error) { setError(linesRes.error.message); setLoading(false); return; }
    if (mapRes.error) { setError(mapRes.error.message); setLoading(false); return; }
    setLines((linesRes.data ?? []) as unknown as ScheduleELineRow[]);
    setMappings(((mapRes.data ?? []) as unknown as CategoryMapping[]).map((m) => ({ ...m, txn_count: Number(m.txn_count) })));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeLines = useMemo(() => lines.filter((l) => l.is_active), [lines]);
  const unmappedCount = useMemo(() => mappings.filter((m) => !m.line_id).length, [mappings]);

  const setMapping = async (categoryId: string, lineId: string) => {
    setBusyId(categoryId);
    const { error: e } = await supabase.rpc('admin_set_category_schedule_e_line', {
      p_category_id: categoryId,
      p_line_id: lineId || null,
    });
    setBusyId(null);
    if (e) { setError(e.message); return; }
    // Patch locally rather than refetching — keeps the row from jumping while
    // working down a long category list.
    const line = lines.find((l) => l.id === lineId);
    setMappings((ms) => ms.map((m) => m.category_id === categoryId
      ? { ...m, line_id: line?.id ?? null, line_code: line?.code ?? null, line_label: line?.label ?? null }
      : m));
  };

  const saveLine = async (id: string | null, label: string, isActive: boolean, sortOrder: number | null) => {
    setBusyId(id ?? 'new');
    const { error: e } = await supabase.rpc('admin_upsert_schedule_e_line', {
      p_id: id,
      p_code: null,
      p_label: label,
      p_sort_order: sortOrder,
      p_is_active: isActive,
    });
    setBusyId(null);
    if (e) { setError(e.message); return; }
    setEditingLineId(null);
    setNewLabel('');
    setAdding(false);
    await load();
  };

  const deleteLine = async (id: string) => {
    setBusyId(id);
    const { error: e } = await supabase.rpc('admin_delete_schedule_e_line', { p_id: id });
    setBusyId(null);
    if (e) { setError(e.message); return; }
    await load();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="p-4 sm:p-5 space-y-5">
      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-500 leading-relaxed">{t('tax.map.explainer')}</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* ── Category → line ── */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-2">
          <h3 className="text-sm font-semibold text-slate-900">{t('tax.map.categoriesHeading')}</h3>
          {unmappedCount > 0 && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
              {t('tax.map.unmappedCount', { count: unmappedCount })}
            </span>
          )}
        </div>

        {mappings.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">{t('tax.map.noCategories')}</p>
        ) : (
          <div className="space-y-1.5">
            {mappings.map((m) => (
              <div
                key={m.category_id}
                className={`flex items-center gap-2 rounded-xl border p-2.5 ${
                  m.line_id ? 'border-slate-200 bg-white' : 'border-amber-200 bg-amber-50/40'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">{m.category_name}</p>
                  <p className="text-[11px] text-slate-400">
                    {t(m.txn_count === 1 ? 'tax.map.usedInOne' : 'tax.map.usedIn', { count: m.txn_count })}
                  </p>
                </div>
                <select
                  value={m.line_id ?? ''}
                  disabled={busyId === m.category_id}
                  onChange={(e) => setMapping(m.category_id, e.target.value)}
                  className={`${field} shrink-0 max-w-[11rem] sm:max-w-[16rem] disabled:opacity-50`}
                  aria-label={t('tax.map.lineFor', { name: m.category_name })}
                >
                  <option value="">{t('tax.map.notMapped')}</option>
                  {activeLines.map((l) => (
                    <option key={l.id} value={l.id}>{l.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── The tax lines themselves ── */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-2">
          <h3 className="text-sm font-semibold text-slate-900">{t('tax.map.linesHeading')}</h3>
          {!adding && (
            <button
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('tax.map.addLine')}
            </button>
          )}
        </div>

        {adding && (
          <div className="flex items-center gap-2 mb-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-2.5">
            <input
              autoFocus
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder={t('tax.map.newLinePlaceholder')}
              className={`${field} flex-1`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newLabel.trim()) saveLine(null, newLabel.trim(), true, null);
                if (e.key === 'Escape') { setAdding(false); setNewLabel(''); }
              }}
            />
            <button
              onClick={() => newLabel.trim() && saveLine(null, newLabel.trim(), true, null)}
              disabled={!newLabel.trim() || busyId === 'new'}
              className="p-2 hover:bg-emerald-100 rounded-lg disabled:opacity-40"
            >
              {busyId === 'new' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-emerald-700" />}
            </button>
            <button onClick={() => { setAdding(false); setNewLabel(''); }} className="p-2 hover:bg-slate-100 rounded-lg">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        )}

        <div className="space-y-1.5">
          {lines.map((l) => {
            const mappedCount = mappings.filter((m) => m.line_id === l.id).length;
            const busy = busyId === l.id;

            return (
              <div
                key={l.id}
                className={`flex items-center gap-2 rounded-xl border p-2.5 ${
                  l.is_active ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-60'
                }`}
              >
                {editingLineId === l.id ? (
                  <>
                    <input
                      autoFocus
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className={`${field} flex-1`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && editLabel.trim()) saveLine(l.id, editLabel.trim(), l.is_active, l.sort_order);
                        if (e.key === 'Escape') setEditingLineId(null);
                      }}
                    />
                    <button
                      onClick={() => editLabel.trim() && saveLine(l.id, editLabel.trim(), l.is_active, l.sort_order)}
                      disabled={!editLabel.trim() || busy}
                      className="p-2 hover:bg-emerald-50 rounded-lg disabled:opacity-40"
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-emerald-600" />}
                    </button>
                    <button onClick={() => setEditingLineId(null)} className="p-2 hover:bg-slate-100 rounded-lg">
                      <X className="w-4 h-4 text-slate-500" />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-slate-900 truncate">{l.label}</p>
                        {!l.is_system && (
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-emerald-50 text-emerald-700 rounded">
                            {t('tax.map.custom')}
                          </span>
                        )}
                        {!l.is_active && (
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-slate-200 text-slate-600 rounded">
                            {t('tax.map.hidden')}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {t(mappedCount === 1 ? 'tax.map.mappedCountOne' : 'tax.map.mappedCount', { count: mappedCount })}
                      </p>
                    </div>

                    <button
                      onClick={() => { setEditingLineId(l.id); setEditLabel(l.label); }}
                      className="p-2 hover:bg-slate-100 rounded-lg"
                      title={t('common.edit')}
                    >
                      <Pencil className="w-4 h-4 text-slate-500" />
                    </button>
                    <button
                      onClick={() => saveLine(l.id, l.label, !l.is_active, l.sort_order)}
                      disabled={busy}
                      className="p-2 hover:bg-slate-100 rounded-lg disabled:opacity-40"
                      title={l.is_active ? t('tax.map.hide') : t('tax.map.show')}
                    >
                      {l.is_active
                        ? <EyeOff className="w-4 h-4 text-slate-500" />
                        : <Eye className="w-4 h-4 text-slate-500" />}
                    </button>
                    {/* Built-in lines have no delete button at all — the RPC
                        refuses them, so offering it would only ever error. */}
                    {!l.is_system && (
                      <button
                        onClick={() => deleteLine(l.id)}
                        disabled={busy}
                        className="p-2 hover:bg-red-50 rounded-lg disabled:opacity-40"
                        title={t('common.delete')}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-slate-400 leading-relaxed mt-3">{t('tax.map.linesFootnote')}</p>
      </section>
    </div>
  );
}
