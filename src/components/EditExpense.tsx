import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { compressImage } from '../lib/imageCompression';
import { X, Upload } from 'lucide-react';

interface Expense {
  id: string;
  expense_date: string;
  vendor: string | null;
  total: number;
  currency: string;
  category: string | null;
  notes: string | null;
  transcript: string | null;
  household_id: string;
  image_path: string | null;
  image_mime: string | null;
  image_width: number | null;
  image_height: number | null;
}

interface Category {
  id: string;
  name: string;
}

interface Household {
  id: string;
  name: string;
}

interface EditExpenseProps {
  expense: Expense;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditExpense({ expense, onClose, onSuccess }: EditExpenseProps) {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [formData, setFormData] = useState({
    household_id: expense.household_id,
    expense_date: expense.expense_date,
    vendor: expense.vendor || '',
    total: expense.total.toString(),
    currency: expense.currency || 'USD',
    category: expense.category || '',
    notes: expense.notes || '',
    transcript: expense.transcript || '',
  });
  const [currentImagePath, setCurrentImagePath] = useState(expense.image_path);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [newImage, setNewImage] = useState<File | null>(null);
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadHouseholds();
    loadCurrentImage();
  }, [user]);

  useEffect(() => {
    if (formData.household_id) {
      loadCategoriesForHousehold(formData.household_id);
    }
  }, [formData.household_id]);

  const loadCurrentImage = async () => {
    if (currentImagePath) {
      try {
        const { data } = await supabase.storage
          .from('receipts')
          .createSignedUrl(currentImagePath, 3600);
        if (data?.signedUrl) {
          setCurrentImageUrl(data.signedUrl);
        }
      } catch (error) {
        console.error('Error loading image:', error);
      }
    }
  };

  const loadHouseholds = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('household_members')
      .select('household_id, households(id, name)')
      .eq('user_id', user.id);

    if (data) {
      const hh = data
        .map((item) => item.households)
        .filter(Boolean) as unknown as Household[];
      setHouseholds(hh);
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

  const handleNewImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressedFile = await compressImage(file, 2);
        setNewImage(compressedFile);
        const reader = new FileReader();
        reader.onloadend = () => setNewImagePreview(reader.result as string);
        reader.readAsDataURL(compressedFile);
      } catch (error) {
        console.error('Error compressing image:', error);
        alert('Failed to process image. Please try another image.');
      }
    }
  };

  const handleRemoveImage = () => {
    setCurrentImagePath(null);
    setCurrentImageUrl(null);
    setNewImage(null);
    setNewImagePreview(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setSaving(true);
    try {
      let imagePath = currentImagePath;
      let imageMime = expense.image_mime;
      let imageWidth = expense.image_width;
      let imageHeight = expense.image_height;

      if (newImage) {
        const fileExt = newImage.name.split('.').pop();
        const fileName = `${formData.household_id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(fileName, newImage);

        if (!uploadError) {
          if (currentImagePath) {
            await supabase.storage.from('receipts').remove([currentImagePath]);
          }

          imagePath = fileName;
          imageMime = newImage.type;

          const img = new Image();
          img.src = newImagePreview!;
          await new Promise((resolve) => {
            img.onload = () => {
              imageWidth = img.width;
              imageHeight = img.height;
              resolve(null);
            };
          });
        }
      } else if (currentImagePath === null && expense.image_path) {
        await supabase.storage.from('receipts').remove([expense.image_path]);
        imagePath = null;
        imageMime = null;
        imageWidth = null;
        imageHeight = null;
      }

      const { error } = await supabase
        .from('expenses')
        .update({
          household_id: formData.household_id,
          expense_date: formData.expense_date,
          vendor: formData.vendor || null,
          total: parseFloat(formData.total) || 0,
          currency: formData.currency,
          category: formData.category || null,
          notes: formData.notes || null,
          transcript: formData.transcript || null,
          image_path: imagePath,
          image_mime: imageMime,
          image_width: imageWidth,
          image_height: imageHeight,
          updated_at: new Date().toISOString(),
        })
        .eq('id', expense.id);

      if (error) throw error;
      onSuccess();
    } catch (error) {
      console.error('Error updating expense:', error);
      alert('Failed to update transaction. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-slate-900">Edit Transaction</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-all"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label htmlFor="household" className="block text-sm font-medium text-slate-700 mb-2">
              Household
            </label>
            <select
              id="household"
              value={formData.household_id}
              onChange={(e) => setFormData({ ...formData, household_id: e.target.value, category: '' })}
              required
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
            >
              <option value="">Select a household</option>
              {households.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-4">
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
            <div>
              <label htmlFor="currency" className="block text-sm font-medium text-slate-700 mb-2">
                Currency
              </label>
              <select
                id="currency"
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="JPY">JPY</option>
                <option value="CAD">CAD</option>
                <option value="AUD">AUD</option>
              </select>
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
              rows={3}
              placeholder="Additional details..."
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all resize-none"
            />
          </div>

          <div>
            <label htmlFor="transcript" className="block text-sm font-medium text-slate-700 mb-2">
              Transcript
            </label>
            <textarea
              id="transcript"
              value={formData.transcript}
              onChange={(e) => setFormData({ ...formData, transcript: e.target.value })}
              rows={3}
              placeholder="Receipt transcript or extracted text..."
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Receipt Image
            </label>
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-all">
              {newImagePreview ? (
                <div className="relative">
                  <img src={newImagePreview} alt="New receipt preview" className="max-h-48 mx-auto rounded-lg" />
                  <button
                    type="button"
                    onClick={() => { setNewImage(null); setNewImagePreview(null); }}
                    className="absolute top-2 right-2 p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : currentImageUrl ? (
                <div className="relative">
                  <img src={currentImageUrl} alt="Current receipt" className="max-h-48 mx-auto rounded-lg" />
                  <div className="absolute top-2 right-2 flex gap-2">
                    <label className="p-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-all cursor-pointer">
                      <Upload className="w-4 h-4" />
                      <input type="file" accept="image/*" onChange={handleNewImageChange} className="hidden" />
                    </label>
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <label className="flex flex-col items-center cursor-pointer py-2">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center mb-2">
                    <Upload className="w-5 h-5 text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-600">Upload receipt</p>
                  <p className="text-xs text-slate-400">PNG, JPG (auto-compressed to 2MB)</p>
                  <input type="file" accept="image/*" onChange={handleNewImageChange} className="hidden" />
                </label>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-900 font-medium rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
