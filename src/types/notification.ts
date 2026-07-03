export type NotificationKind =
  | 'chat_message'
  | 'estimate_created'
  | 'estimate_status'
  | 'invoice_created'
  | 'invoice_paid';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  entity_type: 'estimate' | 'invoice';
  entity_id: string;
  household_id: string | null;
  actor_id: string | null;
  /** Username (pre-@) of the actor, or null. Never a real email. */
  actor_username: string | null;
  /** Denormalized label: estimate title or invoice number. May be null. */
  title: string | null;
  created_at: string;
  read_at: string | null;
}
