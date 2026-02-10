import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { compressImage } from '../lib/imageCompression';
import { X, Upload, Check } from 'lucide-react';

interface Household {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
}

interface AddExpenseProps {
  onClose: () => void;
  onSaved: () => void;
}

export function AddExpense({ onClose, onSaved }: AddExpenseProps) {
  const { user } = useAuth();
  const [households, setHouseholds] = useState<Household[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [formData, setFormData] = useState({
    household_id: '',
    expense_date: new Date().toISOString().split('T')[0],
    vendor: '',
    total: '',
    category: '',
    notes: '',
  });
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    loadOptions();
  }, [user]);

  useEffect(() => {
    if (formData.household_id) {
      loadCategoriesForHousehold(formData.household_id);
    }
  }, [formData.household_id]);

  const loadOptions = async () => {
    if (!user) return;

    const householdRes = await supabase
      .from('household_members')
      .select('household_id, households(id, name)')
      .eq('user_id', user.id);

    if (householdRes.data) {
      const hh = householdRes.data
        .map((item) => item.households)
        .filter(Boolean) as unknown as Household[];
      setHouseholds(hh);
      if (hh.length === 1) {
        setFormData((prev) => ({ ...prev, household_id: hh[0].id }));
      }
    }
  };

  const loadCategoriesForHousehold = async (householdId: string) => {
    const { data } = await supabase
      .from('categories')
      .select('id, name')
      .or(`household_id.is.null,household_id.eq.${householdId}`)
      .order('name');

    if (data) {
      setCategories(data);
    }
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressedFile = await compressImage(file, 2);
        setImage(compressedFile);
        const reader = new FileReader();
        reader.onloadend = () => setImagePreview(reader.result as string);
        reader.readAsDataURL(compressedFile);
      } catch (error) {
        console.error('Error compressing image:', error);
        alert('Failed to process image. Please try another image.');
      }
    }
  };

  const resetForm = () => {
    setFormData((prev) => ({
      household_id: prev.household_id,
      expense_date: new Date().toISOString().split('T')[0],
      vendor: '',
      total: '',
      category: '',
      notes: '',
    }));
    setImage(null);
    setImagePreview(null);
  };

  const saveExpense = async () => {
    if (!user || !formData.household_id) return false;

    setSaving(true);
    try {
      let imagePath = null;
      let imageMime = null;
      let imageWidth = null;
      let imageHeight = null;

      if (image) {
        const fileExt = image.name.split('.').pop();
        const fileName = `${formData.household_id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(fileName, image);

        if (!uploadError) {
          imagePath = fileName;
          imageMime = image.type;

          const img = new Image();
          img.src = imagePreview!;
          await new Promise((resolve) => {
            img.onload = () => {
              imageWidth = img.width;
              imageHeight = img.height;
              resolve(null);
            };
          });
        }
      }

      const { error } = await supabase.from('expenses').insert({
        household_id: formData.household_id,
        created_by: user.id,
        expense_date: formData.expense_date,
        vendor: formData.vendor || null,
        total: parseFloat(formData.total) || 0,
        category: formData.category || null,
        notes: formData.notes || null,
        image_path: imagePath,
        image_mime: imageMime,
        image_width: imageWidth,
        image_height: imageHeight,
      });

      if (error) throw error;

      onSaved();
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
      return true;
    } catch (error) {
      console.error('Error adding expense:', error);
      alert('Failed to add transaction. Please try again.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await saveExpense();
    if (success) {
      resetForm();
    }
  };

  const handleDone = async () => {
    if (!formData.vendor && !formData.total) {
      onClose();
      return;
    }

    const success = await saveExpense();
    if (success) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 p-6 rounded-t-2xl z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-slate-900">Add Transaction</h2>
            <div className="flex items-center gap-3">
              {justSaved && (
                <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                  <Check className="w-4 h-4" />
                  Saved
                </span>
              )}
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-100 rounded-lg transition-all"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Enter transactions continuously. The form stays open after each save.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label htmlFor="household" className="block text-sm font-medium text-slate-700 mb-2">
              Household
            </label>
            <select
              id="household"
              value={formData.household_id}
              onChange={(e) => setFormData({ ...formData, household_id: e.target.value })}
              required
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
            >
              <option value="">Select a household</option>
              {households.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="expense_date" className="block text-sm font-medium text-slate-700 mb-2">
                Date
              </label>
              <input
                id="expense_date"
                type="date"
                value={formData.expense_date}
                onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                required
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
              />
            </div>
            <div>
              <label htmlFor="total" className="block text-sm font-medium text-slate-700 mb-2">
                Amount
              </label>
              <input
                id="total"
                type="number"
                step="0.01"
                value={formData.total}
                onChange={(e) => setFormData({ ...formData, total: e.target.value })}
                required
                placeholder="0.00"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
              />
            </div>
          </div>

          <div>
            <label htmlFor="vendor" className="block text-sm font-medium text-slate-700 mb-2">
              Vendor
            </label>
            <input
              id="vendor"
              type="text"
              value={formData.vendor}
              onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
              placeholder="Whole Foods, Amazon, etc."
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label htmlFor="category" className="block text-sm font-medium text-slate-700 mb-2">
              Category
            </label>
            <select
              id="category"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
            >
              <option value="">Select a category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-slate-700 mb-2">
              Notes
            </label>
            <textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              placeholder="Additional details..."
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Receipt Image
            </label>
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-all">
              {imagePreview ? (
                <div className="relative">
                  <img src={imagePreview} alt="Receipt preview" className="max-h-48 mx-auto rounded-lg" />
                  <button
                    type="button"
                    onClick={() => { setImage(null); setImagePreview(null); }}
                    className="absolute top-2 right-2 p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center cursor-pointer py-2">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center mb-2">
                    <Upload className="w-5 h-5 text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-600">Upload receipt</p>
                  <p className="text-xs text-slate-400">PNG, JPG (auto-compressed to 2MB)</p>
                  <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                </label>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleDone}
              disabled={saving}
              className="flex-1 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Done'}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-900 font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save & Add Another'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
