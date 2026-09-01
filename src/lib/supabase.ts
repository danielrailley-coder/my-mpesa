import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export type Task = {
  id: string;
  title: string;
  description: string;
  category: 'writing' | 'ai_training';
  subcategory: string;
  word_count_target: number;
  pay_rate: number;
  difficulty: 'easy' | 'medium' | 'hard';
  status: 'open' | 'closed';
  created_at: string;
};

export type Submission = {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  word_count: number;
  status: 'pending' | 'approved' | 'rejected';
  feedback: string;
  payout: number;
  submitted_at: string;
  reviewed_at: string | null;
  task?: Task;
};

export type Profile = {
  id: string;
  full_name: string;
  bio: string;
  is_admin: boolean;
  created_at: string;
};

export type Withdrawal = {
  id: string;
  user_id: string;
  amount: number;
  phone_number: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  mpesa_reference: string;
  failure_reason: string;
  requested_at: string;
  processed_at: string | null;
};

export const MIN_WITHDRAWAL = 10;
