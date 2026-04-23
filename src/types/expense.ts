export interface Expense {
  id: string;
  expense_date: string;
  vendor: string | null;
  total: number;
  currency: string;
  category: string | null;
  notes: string | null;
  transcript: string | null;
  household_id: string | null;
  household_name?: string;
  image_path: string | null;
  image_mime: string | null;
  image_width: number | null;
  image_height: number | null;
  created_by: string | null;
  submitter_username?: string;
  paid_at?: string | null;
}

export interface Household {
  id: string;
  name: string;
}
