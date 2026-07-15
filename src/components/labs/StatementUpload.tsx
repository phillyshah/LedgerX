import { useMemo, useState } from 'react';
import { X, Upload, Loader2, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useT } from '../../hooks/useT';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import { parseCsvFile, applyColumnMapping, isImportable, type ParsedCsv, type ColumnMapping, type DraftLineItem } from '../../lib/statementCsv';
import { scanStatement } from '../../lib/statementScanner';

interface StatementUploadProps {
  priorCardLabels: string[];
  onClose: () => void;
  onSaved: () => void;
}

type Step = 'select' | 'mapping' | 'review';
type ColumnRole = 'date' | 'description' | 'amount' | 'ignore';

const PREVIEW_ROWS = 5;

export function StatementUpload({ priorCardLabels, onClose, onSaved }: StatementUploadProps) {
  const { t } = useT();
  useEscapeClose(onClose);

  const [step, setStep] = useState<Step>('select');
  const [cardLabel, setCardLabel] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sourceType, setSourceType] = useState<'csv' | 'pdf' | 'image'>('csv');

  // CSV column-mapping state
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [roles, setRoles] = useState<ColumnRole[]>([]);
  const [signFlip, setSignFlip] = useState(false);

  // Shared review-table state (populated from either CSV mapping or OCR)
  const [items, setItems] = useState<DraftLineItem[]>([]);

  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setError('');
    setFile(picked);

    if (picked.type === 'text/csv' || picked.name.toLowerCase().endsWith('.csv')) {
      setSourceType('csv');
      try {
        const parsed = await parseCsvFile(picked);
        setCsv(parsed);
        setRoles(guessRoles(parsed.headers));
        setStep('mapping');
      } catch {
        setError(t('labs.cc.csvParseError'));
      }
    } else {
      setSourceType(picked.type === 'application/pdf' ? 'pdf' : 'image');
      setStep('review');
      setScanning(true);
      setError('');
      try {
        const ocrItems = await scanStatement(picked);
        setItems(ocrItems.map((i) => ({
          line_date: i.date ?? '',
          description: i.description ?? '',
          amount: i.amount,
        })));
      } catch (err) {
        setError(err instanceof Error ? err.message : t('labs.cc.ocrError'));
        setItems([]);
      } finally {
        setScanning(false);
      }
    }
  };

  const mappingComplete = useMemo(() => {
    return roles.includes('date') && roles.includes('description') && roles.includes('amount');
  }, [roles]);

  const applyMappingAndReview = () => {
    if (!csv || !mappingComplete) return;
    const mapping: ColumnMapping = {
      dateCol: roles.indexOf('date'),
      descriptionCol: roles.indexOf('description'),
      amountCol: roles.indexOf('amount'),
      signFlip,
    };
    setItems(applyColumnMapping(csv.rows, mapping));
    setStep('review');
  };

  const updateItem = (index: number, patch: Partial<DraftLineItem>) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const addBlankItem = () => {
    setItems((prev) => [...prev, { line_date: '', description: '', amount: null }]);
  };

  const importableItems = items.filter(isImportable);
  const skippedCount = items.length - importableItems.length;

  const handleImport = async () => {
    if (!file || !cardLabel.trim() || importableItems.length === 0) return;
    setSaving(true);
    setError('');

    try {
      const { data: statement, error: insertErr } = await supabase
        .from('credit_card_statements')
        .insert({
          card_label: cardLabel.trim(),
          period_start: periodStart || null,
          period_end: periodEnd || null,
          file_path: 'pending',
          file_mime: file.type || null,
          source_type: sourceType,
          status: 'processing',
        })
        .select('id')
        .single();

      if (insertErr || !statement) throw new Error(insertErr?.message || t('labs.cc.uploadError'));

      const ext = (file.name.split('.').pop() || (sourceType === 'csv' ? 'csv' : 'pdf')).toLowerCase();
      const path = `statements/${statement.id}.${ext}`;

      const { error: uploadErr } = await supabase.storage.from('receipts').upload(path, file);
      if (uploadErr) {
        await supabase.from('credit_card_statements').delete().eq('id', statement.id);
        throw new Error(uploadErr.message);
      }

      const { error: updateErr } = await supabase
        .from('credit_card_statements')
        .update({ file_path: path })
        .eq('id', statement.id);
      if (updateErr) throw new Error(updateErr.message);

      const { error: lineItemsErr } = await supabase.from('statement_line_items').insert(
        importableItems.map((it) => ({
          statement_id: statement.id,
          line_date: it.line_date,
          description: it.description,
          amount: it.amount as number,
        }))
      );
      if (lineItemsErr) throw new Error(lineItemsErr.message);

      await supabase.from('credit_card_statements').update({ status: 'ready' }).eq('id', statement.id);

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('labs.cc.uploadError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-start sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-none sm:rounded-2xl w-full max-w-2xl shadow-xl min-h-screen sm:min-h-0 sm:max-h-[90vh] sm:my-4 overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 p-6 rounded-t-2xl z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">{t('labs.cc.uploadTitle')}</h2>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-all">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('labs.cc.cardLabel')}</label>
            <input
              type="text"
              list="cc-card-labels"
              value={cardLabel}
              onChange={(e) => setCardLabel(e.target.value)}
              placeholder={t('labs.cc.cardLabelPlaceholder')}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
            <datalist id="cc-card-labels">
              {priorCardLabels.map((label) => (
                <option key={label} value={label} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('labs.cc.periodStart')}</label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('labs.cc.periodEnd')}</label>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
            </div>
          </div>

          {step === 'select' && (
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl p-10 cursor-pointer hover:border-violet-400 hover:bg-violet-50/40 transition-all">
              <Upload className="w-8 h-8 text-slate-400" />
              <span className="text-sm font-medium text-slate-600">{t('labs.cc.pickFile')}</span>
              <span className="text-xs text-slate-400">{t('labs.cc.pickFileHint')}</span>
              <input
                type="file"
                accept=".csv,text/csv,application/pdf,image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          )}

          {step === 'mapping' && csv && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">{t('labs.cc.mappingHint')}</p>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      {csv.headers.map((header, colIdx) => (
                        <th key={colIdx} className="p-2 text-left border-b border-slate-200 min-w-[140px]">
                          <div className="font-medium text-slate-700 mb-1 truncate">{header}</div>
                          <select
                            value={roles[colIdx] ?? 'ignore'}
                            onChange={(e) => {
                              const role = e.target.value as ColumnRole;
                              setRoles((prev) => prev.map((r, i) => {
                                if (i === colIdx) return role;
                                // Only one column can hold a given role
                                return r === role && role !== 'ignore' ? 'ignore' : r;
                              }));
                            }}
                            className="w-full text-xs px-2 py-1 bg-white border border-slate-200 rounded-lg"
                          >
                            <option value="ignore">{t('labs.cc.roleIgnore')}</option>
                            <option value="date">{t('labs.cc.roleDate')}</option>
                            <option value="description">{t('labs.cc.roleDescription')}</option>
                            <option value="amount">{t('labs.cc.roleAmount')}</option>
                          </select>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csv.rows.slice(0, PREVIEW_ROWS).map((row, rowIdx) => (
                      <tr key={rowIdx} className="border-b border-slate-100 last:border-0">
                        {row.map((cell, colIdx) => (
                          <td key={colIdx} className="p-2 text-slate-600 truncate max-w-[160px]">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={signFlip}
                  onChange={(e) => setSignFlip(e.target.checked)}
                  className="w-4 h-4 accent-violet-600"
                />
                {t('labs.cc.signFlip')}
              </label>
              <button
                onClick={applyMappingAndReview}
                disabled={!mappingComplete}
                className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-xl transition-all disabled:opacity-50"
              >
                {t('labs.cc.continueToReview')}
              </button>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-4">
              {scanning ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
                  <p className="text-sm text-slate-500">{t('labs.cc.scanning')}</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-slate-600">{t('labs.cc.reviewHint')}</p>
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {items.map((item, idx) => {
                      const valid = isImportable(item);
                      return (
                        <div
                          key={idx}
                          className={`grid grid-cols-[110px_1fr_90px_auto] gap-2 items-center p-2 rounded-lg border ${
                            valid ? 'border-slate-200 bg-white' : 'border-amber-200 bg-amber-50'
                          }`}
                        >
                          <input
                            type="date"
                            value={item.line_date}
                            onChange={(e) => updateItem(idx, { line_date: e.target.value })}
                            className="text-xs px-2 py-1.5 border border-slate-200 rounded-lg"
                          />
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => updateItem(idx, { description: e.target.value })}
                            placeholder={t('labs.cc.roleDescription')}
                            className="text-xs px-2 py-1.5 border border-slate-200 rounded-lg min-w-0"
                          />
                          <input
                            type="number"
                            step="0.01"
                            value={item.amount ?? ''}
                            onChange={(e) => updateItem(idx, { amount: e.target.value ? parseFloat(e.target.value) : null })}
                            className="text-xs px-2 py-1.5 border border-slate-200 rounded-lg"
                          />
                          <button onClick={() => removeItem(idx)} className="p-1.5 hover:bg-red-50 rounded-lg">
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    onClick={addBlankItem}
                    className="flex items-center gap-1.5 text-sm text-violet-700 hover:text-violet-800 font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    {t('labs.cc.addRow')}
                  </button>

                  {skippedCount > 0 && (
                    <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {t('labs.cc.skippedRows', { count: skippedCount })}
                    </div>
                  )}

                  <button
                    onClick={handleImport}
                    disabled={saving || !cardLabel.trim() || importableItems.length === 0}
                    className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    {t('labs.cc.importCount', { count: importableItems.length })}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Heuristic header-name guesses so the common case ("Date, Description,
// Amount") needs zero clicks — the user only has to fix the mapping when a
// bank's export uses unusual column names.
function guessRoles(headers: string[]): ColumnRole[] {
  const used = new Set<ColumnRole>();
  return headers.map((h) => {
    const lower = h.toLowerCase();
    let role: ColumnRole = 'ignore';
    if (!used.has('date') && /date/.test(lower)) role = 'date';
    else if (!used.has('description') && /(description|merchant|payee|memo|name)/.test(lower)) role = 'description';
    else if (!used.has('amount') && /(amount|charge|debit)/.test(lower)) role = 'amount';
    if (role !== 'ignore') used.add(role);
    return role;
  });
}
