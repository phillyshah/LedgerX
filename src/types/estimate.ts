export type EstimateStatus = 'open' | 'accepted' | 'rejected';

export interface Estimate {
  id: string;
  created_by: string;
  household_id: string | null;
  title: string;
  description: string | null;
  status: EstimateStatus;
  admin_notes: string | null;
  // legacy single-attachment slot (mirrors contractor_invoices)
  file_path: string | null;
  file_mime: string | null;
  created_at: string;
  updated_at: string;
  // Joined/derived fields (not raw DB columns)
  household_name?: string;
  submitter_username?: string;
  /** Count of unread messages from the other party (from list_estimate_unread). */
  unread_count?: number;
}

export interface EstimateAttachment {
  id: string;
  estimate_id: string;
  file_path: string;
  file_mime: string | null;
  file_width: number | null;
  file_height: number | null;
  display_order: number;
  created_at: string;
}

export interface EstimateMessage {
  id: string;
  estimate_id: string;
  sender_id: string;
  sender_username: string;
  body: string;
  created_at: string;
}
