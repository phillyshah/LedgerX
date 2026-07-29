/** 'completed' closes out an accepted estimate once the work is finished —
 *  see 20260803000000_estimate_completion_and_links.sql. */
export type EstimateStatus = 'open' | 'accepted' | 'rejected' | 'completed';
export type BillingType = 'total' | 'labor_only';

export interface Estimate {
  id: string;
  created_by: string;
  household_id: string | null;
  title: string;
  description: string | null;
  status: EstimateStatus;
  billing_type: BillingType;
  /** Quoted amount. Nullable — estimates predating v13.17 have none, and
   *  clearing it back to "not quoted" is a legitimate edit. */
  amount: number | null;
  currency: string;
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
  /** True when the current user was explicitly invited by an admin. */
  is_participant?: boolean;
}

export interface EstimateParticipant {
  user_id: string;
  username: string;
  invited_at: string;
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

/** One transaction or contractor invoice linked to an estimate, as returned
 *  by list_estimate_links. `kind` discriminates the two sources. */
export interface EstimateLink {
  link_id: string;
  kind: 'expense' | 'invoice';
  item_id: string;
  occurred_on: string;
  label: string;
  detail: string | null;
  amount: number;
  currency: string;
  linked_at: string;
}

/** An unlinked transaction or invoice offered for linking. */
export interface EstimateLinkCandidate {
  kind: 'expense' | 'invoice';
  item_id: string;
  occurred_on: string;
  label: string;
  detail: string | null;
  amount: number;
  currency: string;
  household_id: string | null;
}
