export type InvoiceStatus = 'pending' | 'paid';

/** How an invoice was paid — recorded (optionally) when marking it paid. */
export const PAYMENT_METHODS = ['venmo', 'zelle', 'ach', 'check', 'credit', 'other'] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

export const PROPERTY_TYPES = ['Residential', 'Commercial', 'Vacation Rental', 'Other'] as const;
export type PropertyType = typeof PROPERTY_TYPES[number];

export interface ContractorInvoice {
  id: string;
  invoice_number: string | null;
  created_by: string;
  household_id: string | null;
  category_id: string | null;
  amount: number;
  currency: string;
  description: string;
  service_date_start: string; // 'YYYY-MM-DD'
  service_date_end: string;   // 'YYYY-MM-DD'
  status: InvoiceStatus;
  admin_notes: string | null;
  image_path: string | null;
  image_mime: string | null;
  image_width: number | null;
  image_height: number | null;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
  payment_method: PaymentMethod | null;
  payment_method_note: string | null;
  // Joined/derived fields (not raw DB columns)
  household_name?: string;
  property_type?: PropertyType | null;
  submitter_username?: string;
  category_name?: string | null;
}

export interface InvoiceImage {
  id: string;
  invoice_id: string;
  image_path: string;
  image_mime: string | null;
  image_width: number | null;
  image_height: number | null;
  display_order: number;
  created_at: string;
  /** True for contractor work-in-progress photos (not the invoice scan itself). */
  is_work_evidence?: boolean;
}

/** OCR extraction result from the extract-invoice edge function */
export interface InvoiceOCRData {
  invoice_number: string | null;
  vendor_name: string | null;
  total_amount: number | null;
  invoice_date: string | null;
  due_date: string | null;
  service_date_start: string | null;
  service_date_end: string | null;
  description: string | null;
  currency: 'USD' | 'EUR' | 'CAD' | 'BRL' | null;
}
