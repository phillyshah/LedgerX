import { useState } from 'react';
import { Bookmark, Trash2 } from 'lucide-react';
import { useT } from '../hooks/useT';
import { supabase } from '../lib/supabase';
import { useTemplates, type TemplateKind, type TransactionTemplate } from '../hooks/useTemplates';

interface TemplatePickerProps {
  kind: TemplateKind;
  /**
   * Called with the chosen template when the user picks one. The form
   * is responsible for applying the template's fields to its state —
   * we don't presume the form's shape from in here.
   */
  onPick: (template: TransactionTemplate) => void;
  /**
   * Bump this number to force a re-fetch — e.g. after the parent form
   * just saved a new template via the SaveAsTemplate toggle. Without
   * this the picker would only see the new template after a remount.
   */
  refreshKey?: number;
}

/**
 * Compact template picker rendered at the top of AddExpense / InvoiceForm
 * when the user has at least one saved template of the matching kind.
 * Hidden entirely when the templates list is empty — a brand-new user
 * never sees it cluttering the form.
 *
 * Each template surfaces a small inline delete button so users can
 * prune stale ones without leaving the form.
 */
export function TemplatePicker({ kind, onPick, refreshKey }: TemplatePickerProps) {
  const { t } = useT();
  const { templates, loading, reload } = useTemplates(kind, refreshKey);
  const [open, setOpen] = useState(false);

  if (loading) return null;
  if (templates.length === 0) return null;

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(t('templates.confirmDelete', { name }))) return;
    const { error } = await supabase.from('transaction_templates').delete().eq('id', id);
    if (!error) reload();
  };

  return (
    <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 text-sm font-medium text-emerald-900"
      >
        <Bookmark className="w-4 h-4" />
        {t('templates.useTemplate')}
        <span className="ml-auto text-xs text-emerald-700">
          {open ? t('templates.collapse') : t('templates.expand', { count: templates.length })}
        </span>
      </button>
      {open && (
        <div className="mt-3 flex flex-wrap gap-2">
          {templates.map((tpl) => (
            <div key={tpl.id} className="flex items-center bg-white border border-emerald-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => { onPick(tpl); setOpen(false); }}
                className="px-3 py-1.5 text-sm font-medium text-emerald-900 hover:bg-emerald-50"
              >
                {tpl.name}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(tpl.id, tpl.name)}
                className="px-2 py-1.5 text-emerald-400 hover:text-red-600 hover:bg-red-50"
                aria-label={t('common.delete')}
                title={t('common.delete')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface SaveAsTemplateToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  templateName: string;
  onTemplateNameChange: (name: string) => void;
}

/**
 * "Save as template" checkbox + name input. Used at the bottom of
 * AddExpense / InvoiceForm. Visible during entry but hides the name
 * input until the box is checked — keeps the form quiet for users who
 * never use templates.
 */
export function SaveAsTemplateToggle({
  checked,
  onChange,
  templateName,
  onTemplateNameChange,
}: SaveAsTemplateToggleProps) {
  const { t } = useT();
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
      <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 text-emerald-600 rounded focus:ring-2 focus:ring-emerald-500"
        />
        <Bookmark className="w-4 h-4 text-slate-500" />
        {t('templates.saveAsTemplate')}
      </label>
      {checked && (
        <input
          type="text"
          value={templateName}
          onChange={(e) => onTemplateNameChange(e.target.value)}
          placeholder={t('templates.namePlaceholder')}
          className="mt-2 w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
        />
      )}
    </div>
  );
}
