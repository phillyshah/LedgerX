export interface Database {
  public: {
    Tables: {
      households: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
        };
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
        };
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
      };
      user_roles: {
        Row: {
          id: string;
          user_id: string;
          is_admin: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          is_admin?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          is_admin?: boolean;
          created_at?: string;
        };
      };
      categories: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
        };
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
        };
      };
      vendor_category_map: {
        Row: {
          id: string;
          household_id: string;
          vendor_name: string;
          category_name: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          vendor_name: string;
          category_name: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          vendor_name?: string;
          category_name?: string;
          updated_at?: string;
        };
      };
      user_profiles: {
        Row: {
          id: string;
          username: string;
          email: string;
          real_email: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          username: string;
          email: string;
          real_email?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          email?: string;
          real_email?: string | null;
          created_at?: string;
        };
      };
    };
  };
}
