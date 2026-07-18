export interface Database {
  public: {
    Tables: {
      households: {
        Row: {
          id: string;
          name: string;
          created_at: string;
          features_enabled: Record<string, boolean>;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
          features_enabled?: Record<string, boolean>;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
          features_enabled?: Record<string, boolean>;
        };
        Relationships: [];
      };
      household_members: {
        Row: {
          id: string;
          household_id: string;
          user_id: string;
          role: 'owner' | 'member';
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          user_id: string;
          role?: 'owner' | 'member';
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          user_id?: string;
          role?: 'owner' | 'member';
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'household_members_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      expenses: {
        Row: {
          id: string;
          household_id: string | null;
          created_by: string;
          expense_date: string;
          vendor: string | null;
          total: number;
          currency: string;
          category: string | null;
          notes: string | null;
          transcript: string | null;
          image_path: string | null;
          image_mime: string | null;
          image_width: number | null;
          image_height: number | null;
          pic_id: string | null;
          created_at: string;
          updated_at: string;
          paid_at: string | null;
        };
        Insert: {
          id?: string;
          household_id?: string | null;
          created_by: string;
          expense_date: string;
          vendor?: string | null;
          total?: number;
          currency?: string;
          category?: string | null;
          notes?: string | null;
          transcript?: string | null;
          image_path?: string | null;
          image_mime?: string | null;
          image_width?: number | null;
          image_height?: number | null;
          pic_id?: string | null;
          created_at?: string;
          updated_at?: string;
          paid_at?: string | null;
        };
        Update: {
          id?: string;
          household_id?: string | null;
          created_by?: string;
          expense_date?: string;
          vendor?: string | null;
          total?: number;
          currency?: string;
          category?: string | null;
          notes?: string | null;
          transcript?: string | null;
          image_path?: string | null;
          image_mime?: string | null;
          image_width?: number | null;
          image_height?: number | null;
          pic_id?: string | null;
          created_at?: string;
          updated_at?: string;
          paid_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'expenses_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      expense_images: {
        Row: {
          id: string;
          expense_id: string;
          image_path: string;
          image_mime: string | null;
          image_width: number | null;
          image_height: number | null;
          display_order: number;
          created_at: string;
          is_work_evidence: boolean;
        };
        Insert: {
          id?: string;
          expense_id: string;
          image_path: string;
          image_mime?: string | null;
          image_width?: number | null;
          image_height?: number | null;
          display_order?: number;
          created_at?: string;
          is_work_evidence?: boolean;
        };
        Update: {
          id?: string;
          expense_id?: string;
          image_path?: string;
          image_mime?: string | null;
          image_width?: number | null;
          image_height?: number | null;
          display_order?: number;
          created_at?: string;
          is_work_evidence?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'expense_images_expense_id_fkey';
            columns: ['expense_id'];
            isOneToOne: false;
            referencedRelation: 'expenses';
            referencedColumns: ['id'];
          },
        ];
      };
      contractor_invoices: {
        Row: {
          id: string;
          invoice_number: string | null;
          created_by: string;
          household_id: string | null;
          amount: number;
          currency: string;
          description: string;
          service_date_start: string;
          service_date_end: string;
          status: 'pending' | 'paid';
          admin_notes: string | null;
          image_path: string | null;
          image_mime: string | null;
          image_width: number | null;
          image_height: number | null;
          created_at: string;
          updated_at: string;
          paid_at: string | null;
          category_id: string | null;
          payment_method: 'venmo' | 'zelle' | 'ach' | 'check' | 'credit' | 'other' | null;
          payment_method_note: string | null;
        };
        Insert: {
          id?: string;
          invoice_number?: string | null;
          created_by: string;
          household_id?: string | null;
          amount: number;
          currency?: string;
          description: string;
          service_date_start: string;
          service_date_end: string;
          status?: 'pending' | 'approved' | 'paid' | 'rejected';
          admin_notes?: string | null;
          image_path?: string | null;
          image_mime?: string | null;
          image_width?: number | null;
          image_height?: number | null;
          created_at?: string;
          updated_at?: string;
          paid_at?: string | null;
          category_id?: string | null;
          payment_method?: string | null;
          payment_method_note?: string | null;
        };
        Update: {
          id?: string;
          invoice_number?: string | null;
          created_by?: string;
          household_id?: string | null;
          amount?: number;
          currency?: string;
          description?: string;
          service_date_start?: string;
          service_date_end?: string;
          status?: 'pending' | 'approved' | 'paid' | 'rejected';
          admin_notes?: string | null;
          image_path?: string | null;
          image_mime?: string | null;
          image_width?: number | null;
          image_height?: number | null;
          created_at?: string;
          updated_at?: string;
          paid_at?: string | null;
          category_id?: string | null;
          payment_method?: string | null;
          payment_method_note?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'contractor_invoices_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      invoice_images: {
        Row: {
          id: string;
          invoice_id: string;
          image_path: string;
          image_mime: string | null;
          image_width: number | null;
          image_height: number | null;
          display_order: number;
          created_at: string;
          is_work_evidence: boolean;
        };
        Insert: {
          id?: string;
          invoice_id: string;
          image_path: string;
          image_mime?: string | null;
          image_width?: number | null;
          image_height?: number | null;
          display_order?: number;
          created_at?: string;
          is_work_evidence?: boolean;
        };
        Update: {
          id?: string;
          invoice_id?: string;
          image_path?: string;
          image_mime?: string | null;
          image_width?: number | null;
          image_height?: number | null;
          display_order?: number;
          created_at?: string;
          is_work_evidence?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'invoice_images_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'contractor_invoices';
            referencedColumns: ['id'];
          },
        ];
      };
      exports: {
        Row: {
          id: string;
          household_id: string;
          requested_by: string;
          start_date: string;
          end_date: string;
          status: 'queued' | 'running' | 'completed' | 'failed';
          file_path: string | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          requested_by: string;
          start_date: string;
          end_date: string;
          status?: 'queued' | 'running' | 'completed' | 'failed';
          file_path?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          household_id?: string;
          requested_by?: string;
          start_date?: string;
          end_date?: string;
          status?: 'queued' | 'running' | 'completed' | 'failed';
          file_path?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          user_id: string;
          is_admin: boolean;
          is_contractor: boolean;
          is_household_admin: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          is_admin?: boolean;
          is_contractor?: boolean;
          is_household_admin?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          is_admin?: boolean;
          is_contractor?: boolean;
          is_household_admin?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          name: string;
          household_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          household_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          household_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      vendor_category_map: {
        Row: {
          id: string;
          household_id: string | null;
          vendor_name: string;
          category_name: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id?: string | null;
          vendor_name: string;
          category_name: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string | null;
          vendor_name?: string;
          category_name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_sender_emails: {
        Row: {
          id: string;
          user_id: string;
          email: string;
          label: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          email: string;
          label?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          email?: string;
          label?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      user_phone_numbers: {
        Row: {
          id: string;
          user_id: string;
          phone: string;
          label: string | null;
          last_inbound_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          phone: string;
          label?: string | null;
          last_inbound_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          phone?: string;
          label?: string | null;
          last_inbound_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      email_inbox: {
        Row: {
          id: string;
          user_id: string;
          from_email: string;
          subject: string | null;
          received_at: string;
          attachment_paths: string[];
          kind: 'expense' | 'invoice';
          prefilled: Record<string, unknown>;
          status: 'pending' | 'accepted' | 'discarded';
          message_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          from_email: string;
          subject?: string | null;
          received_at?: string;
          attachment_paths?: string[];
          kind?: 'expense' | 'invoice';
          prefilled?: Record<string, unknown>;
          status?: 'pending' | 'accepted' | 'discarded';
          message_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          from_email?: string;
          subject?: string | null;
          received_at?: string;
          attachment_paths?: string[];
          kind?: 'expense' | 'invoice';
          prefilled?: Record<string, unknown>;
          status?: 'pending' | 'accepted' | 'discarded';
          message_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      transaction_templates: {
        Row: {
          id: string;
          owner_id: string;
          kind: 'expense' | 'invoice';
          name: string;
          household_id: string | null;
          vendor: string | null;
          amount: number | null;
          currency: string;
          category: string | null;
          category_id: string | null;
          description: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          kind: 'expense' | 'invoice';
          name: string;
          household_id?: string | null;
          vendor?: string | null;
          amount?: number | null;
          currency?: string;
          category?: string | null;
          category_id?: string | null;
          description?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          kind?: 'expense' | 'invoice';
          name?: string;
          household_id?: string | null;
          vendor?: string | null;
          amount?: number | null;
          currency?: string;
          category?: string | null;
          category_id?: string | null;
          description?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      category_households: {
        Row: {
          id: string;
          category_id: string;
          household_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          category_id: string;
          household_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          category_id?: string;
          household_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'category_households_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'category_households_household_id_fkey';
            columns: ['household_id'];
            isOneToOne: false;
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ];
      };
      user_profiles: {
        Row: {
          id: string;
          username: string;
          email: string;
          real_email: string | null;
          preferred_language: 'en' | 'pt-BR';
          notify_channel: 'email' | 'whatsapp' | 'both';
          created_at: string;
        };
        Insert: {
          id: string;
          username: string;
          email: string;
          real_email?: string | null;
          preferred_language?: 'en' | 'pt-BR';
          notify_channel?: 'email' | 'whatsapp' | 'both';
          created_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          email?: string;
          real_email?: string | null;
          preferred_language?: 'en' | 'pt-BR';
          notify_channel?: 'email' | 'whatsapp' | 'both';
          created_at?: string;
        };
        Relationships: [];
      };
      credit_card_statements: {
        Row: {
          id: string;
          uploaded_by: string;
          card_label: string;
          period_start: string | null;
          period_end: string | null;
          file_path: string;
          file_mime: string | null;
          source_type: 'csv' | 'pdf' | 'image';
          column_mapping: Record<string, unknown> | null;
          status: 'processing' | 'ready' | 'error';
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          uploaded_by?: string;
          card_label: string;
          period_start?: string | null;
          period_end?: string | null;
          file_path: string;
          file_mime?: string | null;
          source_type?: 'csv' | 'pdf' | 'image';
          column_mapping?: Record<string, unknown> | null;
          status?: 'processing' | 'ready' | 'error';
          error_message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          uploaded_by?: string;
          card_label?: string;
          period_start?: string | null;
          period_end?: string | null;
          file_path?: string;
          file_mime?: string | null;
          source_type?: 'csv' | 'pdf' | 'image';
          column_mapping?: Record<string, unknown> | null;
          status?: 'processing' | 'ready' | 'error';
          error_message?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      statement_line_items: {
        Row: {
          id: string;
          statement_id: string;
          line_date: string;
          description: string;
          amount: number;
          currency: string;
          matched_expense_id: string | null;
          matched_at: string | null;
          matched_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          statement_id: string;
          line_date: string;
          description: string;
          amount: number;
          currency?: string;
          matched_expense_id?: string | null;
          matched_at?: string | null;
          matched_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          statement_id?: string;
          line_date?: string;
          description?: string;
          amount?: number;
          currency?: string;
          matched_expense_id?: string | null;
          matched_at?: string | null;
          matched_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'statement_line_items_statement_id_fkey';
            columns: ['statement_id'];
            isOneToOne: false;
            referencedRelation: 'credit_card_statements';
            referencedColumns: ['id'];
          },
        ];
      };
      statement_line_item_comments: {
        Row: {
          id: string;
          line_item_id: string;
          author_id: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          line_item_id: string;
          author_id?: string;
          body: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          line_item_id?: string;
          author_id?: string;
          body?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'statement_line_item_comments_line_item_id_fkey';
            columns: ['line_item_id'];
            isOneToOne: false;
            referencedRelation: 'statement_line_items';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      // Auth helpers
      get_user_email_by_username: {
        Args: { p_username: string };
        Returns: string;
      };
      get_real_email_by_username: {
        Args: { p_username: string };
        Returns: string;
      };
      // Admin: users
      admin_list_users: {
        Args: Record<string, never>;
        Returns: Array<{
          id: string;
          username: string;
          is_admin: boolean;
          is_contractor: boolean;
          is_household_admin: boolean;
          preferred_language: string;
          created_at: string;
        }>;
      };
      admin_update_user_role: {
        Args: { p_user_id: string; p_is_admin: boolean; p_is_contractor: boolean; p_is_household_admin: boolean };
        Returns: undefined;
      };
      admin_update_user_language: {
        Args: { p_user_id: string; p_language: string };
        Returns: undefined;
      };
      // Admin: households
      admin_create_household: {
        Args: { household_name: string };
        Returns: undefined;
      };
      admin_delete_household: {
        Args: { p_household_id: string };
        Returns: undefined;
      };
      admin_add_household_member_by_id: {
        Args: { p_household_id: string; p_user_id: string; p_role: string };
        Returns: undefined;
      };
      admin_remove_household_member: {
        Args: { p_member_id: string };
        Returns: undefined;
      };
      admin_update_household_features: {
        Args: { p_household_id: string; p_features: Record<string, boolean> };
        Returns: undefined;
      };
      // Admin: categories
      admin_set_category_households: {
        Args: { p_category_id: string; p_household_ids: string[] | null };
        Returns: undefined;
      };
      // Admin: expenses
      admin_get_uncategorized_expenses: {
        Args: Record<string, never>;
        Returns: Array<{
          id: string;
          household_id: string | null;
          household_name: string | null;
          created_by: string;
          creator_email: string;
          expense_date: string;
          vendor: string | null;
          total: number;
          currency: string;
          category: string | null;
          notes: string | null;
          transcript: string | null;
          image_path: string | null;
          image_mime: string | null;
          image_width: number | null;
          image_height: number | null;
          created_at: string;
          updated_at: string;
          is_orphaned_household: boolean;
          is_invalid_category: boolean;
        }>;
      };
      admin_reallocate_expense: {
        Args: { p_expense_id: string; p_new_household_id: string | null; p_new_category: string | null };
        Returns: undefined;
      };
      admin_mark_expense_paid: {
        Args: { p_expense_id: string; p_paid: boolean };
        Returns: undefined;
      };
      // Admin: invoices
      admin_update_invoice_status: {
        Args: { p_invoice_id: string; p_status: string; p_admin_notes?: string };
        Returns: undefined;
      };
      admin_set_invoice_category: {
        Args: { p_invoice_id: string; p_category_id: string | null };
        Returns: undefined;
      };
      resolve_sender_email: {
        Args: { p_email: string };
        Returns: string | null;
      };
      // Admin: vendors
      admin_upsert_vendor_mapping: {
        Args: { p_vendor_name: string; p_category_name: string; p_household_id?: string | null };
        Returns: undefined;
      };
      // Member: memorize vendor → category pair on save (works around the
      // Labs: credit card statement reconciliation
      can_act_on_expense: {
        Args: { p_expense_id: string };
        Returns: boolean;
      };
      match_statement_line_item: {
        Args: { p_line_item_id: string; p_expense_id: string };
        Returns: undefined;
      };
      unmatch_statement_line_item: {
        Args: { p_line_item_id: string };
        Returns: undefined;
      };
      bulk_match_statement_line_items: {
        Args: { p_matches: Array<{ line_item_id: string; expense_id: string }> };
        Returns: { matched: number; skipped: Array<{ line_item_id: string; reason: string }> };
      };
      admin_update_statement_line_item: {
        Args: { p_line_item_id: string; p_line_date: string; p_description: string; p_amount: number };
        Returns: undefined;
      };
      list_reconciliation_inbox_candidates: {
        Args: Record<string, never>;
        Returns: Array<{
          id: string;
          from_email: string;
          subject: string | null;
          received_at: string;
          attachment_paths: string[];
          vendor: string | null;
          total: number;
          expense_date: string;
          notes: string | null;
          submitter_user_id: string;
          submitter_username: string | null;
        }>;
      };
      match_inbox_item_to_line_item: {
        Args: {
          p_line_item_id: string;
          p_inbox_id: string;
          p_household_id: string;
          p_category: string | null;
          p_images: Array<{ path: string; mime: string; width: number | null; height: number | null }>;
        };
        Returns: string;
      };
      set_expense_category: {
        Args: { p_expense_id: string; p_category: string | null };
        Returns: undefined;
      };
      list_reconciliation_candidates: {
        Args: Record<string, never>;
        Returns: Array<{
          id: string;
          expense_date: string;
          vendor: string | null;
          total: number;
          currency: string;
          category: string | null;
          notes: string | null;
          transcript: string | null;
          household_id: string | null;
          household_name: string | null;
          image_path: string | null;
          image_mime: string | null;
          image_width: number | null;
          image_height: number | null;
          created_by: string | null;
          submitter_username: string | null;
          paid_at: string | null;
        }>;
      };
      reconciliation_mentionable: {
        Args: Record<string, never>;
        Returns: Array<{ uid: string; username: string; hint: string }>;
      };
      list_line_item_comments: {
        Args: { p_line_item_id: string };
        Returns: Array<{
          id: string;
          line_item_id: string;
          author_id: string;
          author_username: string;
          body: string;
          created_at: string;
        }>;
      };
      list_reconciliation_report: {
        Args: Record<string, never>;
        Returns: Array<{
          line_item_id: string;
          statement_id: string;
          card_label: string;
          line_date: string;
          description: string;
          amount: number;
          currency: string;
          is_matched: boolean;
          matched_expense_id: string | null;
          matched_household: string | null;
          matched_by: string | null;
          matched_by_username: string | null;
          matched_at: string | null;
        }>;
      };
    };
  };
}
