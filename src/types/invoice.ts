export type InvoiceStatus = 'pending' | 'paid';

export const PROPERTY_TYPES = ['Residential', 'Commercial', 'Vacation Rental', 'Other'] as const;
export type PropertyType = typeof PROPERTY_TYPES[number];

export interface ContractorInvoice {
  id: string;
  invoice_number: string | null;
  created_by: string;
  household_id: string | null;
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
  // Joined/derived fields (not raw DB columns)
  household_name?: string;
  property_type?: PropertyType | null;
  submitter_username?: string;
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
