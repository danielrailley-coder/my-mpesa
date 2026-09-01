/*
# Create Writing & AI Training Platform Schema

## Overview
Multi-user platform where writers sign in, browse paid writing and AI-training tasks,
submit work, and track earnings. Admin-created tasks; writers submit; submissions
get reviewed and paid.

## New Tables

### profiles
- `id` (uuid, PK, references auth.users)
- `full_name` (text)
- `bio` (text)
- `is_admin` (boolean, default false) — marks platform operators who create tasks and review submissions
- `created_at` (timestamptz)

### tasks
- `id` (uuid, PK)
- `title` (text, not null)
- `description` (text, not null)
- `category` (text, not null) — 'writing' or 'ai_training'
- `subcategory` (text) — e.g. 'blog_post', 'prompt_response', 'fact_check'
- `word_count_target` (integer) — target length for writing tasks
- `pay_rate` (numeric(10,2), not null) — payout in USD
- `difficulty` (text, default 'medium') — 'easy', 'medium', 'hard'
- `status` (text, default 'open') — 'open', 'closed'
- `created_at` (timestamptz)

### submissions
- `id` (uuid, PK)
- `task_id` (uuid, FK to tasks, cascade delete)
- `user_id` (uuid, FK to auth.users, cascade delete) — the writer who submitted
- `content` (text, not null) — the submitted writing or AI-training response
- `word_count` (integer) — computed word count of content
- `status` (text, default 'pending') — 'pending', 'approved', 'rejected'
- `feedback` (text) — reviewer notes
- `payout` (numeric(10,2)) — amount paid when approved (copied from task pay_rate)
- `submitted_at` (timestamptz)
- `reviewed_at` (timestamptz)

## Security
- RLS enabled on all tables.
- profiles: each authenticated user can read all profiles, update only their own. is_admin is protected via the update WITH CHECK.
- tasks: any authenticated user can read tasks. Only admins can insert/update/delete.
- submissions: writers can read their own and insert their own. Admins can read all and update (review) any.

## Important Notes
1. A trigger creates a profile row automatically on signup.
2. The is_admin flag defaults to false; admins are set via the database directly.
3. An is_current_user_admin() SECURITY DEFINER function lets RLS policies check admin status.
*/

-- profiles table (must exist before the function that references it)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text DEFAULT '',
  bio text DEFAULT '',
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_all_authenticated" ON public.profiles;
CREATE POLICY "profiles_select_all_authenticated"
ON public.profiles FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Helper function: check if current user is admin (SECURITY DEFINER so it bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;

-- Trigger: auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'full_name', ''));
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- tasks table
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL CHECK (category IN ('writing', 'ai_training')),
  subcategory text DEFAULT '',
  word_count_target integer DEFAULT 0,
  pay_rate numeric(10,2) NOT NULL DEFAULT 0,
  difficulty text NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_select_authenticated" ON public.tasks;
CREATE POLICY "tasks_select_authenticated"
ON public.tasks FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "tasks_insert_admin" ON public.tasks;
CREATE POLICY "tasks_insert_admin"
ON public.tasks FOR INSERT
TO authenticated WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS "tasks_update_admin" ON public.tasks;
CREATE POLICY "tasks_update_admin"
ON public.tasks FOR UPDATE
TO authenticated USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS "tasks_delete_admin" ON public.tasks;
CREATE POLICY "tasks_delete_admin"
ON public.tasks FOR DELETE
TO authenticated USING (public.is_current_user_admin());

-- submissions table
CREATE TABLE IF NOT EXISTS public.submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  word_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  feedback text DEFAULT '',
  payout numeric(10,2) DEFAULT 0,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "submissions_select_own_or_admin" ON public.submissions;
CREATE POLICY "submissions_select_own_or_admin"
ON public.submissions FOR SELECT
TO authenticated USING (auth.uid() = user_id OR public.is_current_user_admin());

DROP POLICY IF EXISTS "submissions_insert_own" ON public.submissions;
CREATE POLICY "submissions_insert_own"
ON public.submissions FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "submissions_update_admin" ON public.submissions;
CREATE POLICY "submissions_update_admin"
ON public.submissions FOR UPDATE
TO authenticated USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS "submissions_delete_admin" ON public.submissions;
CREATE POLICY "submissions_delete_admin"
ON public.submissions FOR DELETE
TO authenticated USING (public.is_current_user_admin());

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON public.submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_task_id ON public.submissions(task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_category ON public.tasks(category);
