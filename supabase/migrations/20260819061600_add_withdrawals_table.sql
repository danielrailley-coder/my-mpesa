/*
# Add Withdrawals Table for M-Pesa Cash Out

## Overview
Writers accumulate earnings from approved submissions. This migration adds a withdrawals
table so writers can request cash-outs to their M-Pesa phone number. Each withdrawal has a
status lifecycle: pending -> processing -> completed / failed.

## New Tables

### withdrawals
- `id` (uuid, PK)
- `user_id` (uuid, FK to auth.users, cascade delete) — the writer requesting the withdrawal
- `amount` (numeric(10,2), not null) — amount in USD to withdraw
- `phone_number` (text, not null) — M-Pesa phone number (e.g. 254712345678)
- `status` (text, default 'pending') — 'pending', 'processing', 'completed', 'failed'
- `mpesa_reference` (text) — M-Pesa transaction reference returned on success
- `failure_reason` (text) — reason if the withdrawal failed
- `requested_at` (timestamptz, default now())
- `processed_at` (timestamptz) — when the withdrawal was completed or failed

## Security
- RLS enabled on withdrawals.
- Writers can read their own withdrawals and insert their own (request a withdrawal).
- Only admins can update withdrawal status (process/complete/fail).
- Writers cannot delete withdrawals.

## Important Notes
1. A writer's available balance = sum of approved submission payouts minus sum of completed
   withdrawal amounts. This is computed in the app; the database enforces ownership via RLS.
2. The edge function (mpesa-withdraw) handles the B2C disbursement via the M-Pesa API and
   updates the withdrawal status. Only the service role key can update status.
3. Minimum withdrawal amount is enforced in the app ($10).
4. Phone numbers are stored in international format without the + (e.g. 254712345678).
*/

CREATE TABLE IF NOT EXISTS public.withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL,
  phone_number text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  mpesa_reference text DEFAULT '',
  failure_reason text DEFAULT '',
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "withdrawals_select_own" ON public.withdrawals;
CREATE POLICY "withdrawals_select_own"
ON public.withdrawals FOR SELECT
TO authenticated USING (auth.uid() = user_id OR public.is_current_user_admin());

DROP POLICY IF EXISTS "withdrawals_insert_own" ON public.withdrawals;
CREATE POLICY "withdrawals_insert_own"
ON public.withdrawals FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "withdrawals_update_admin" ON public.withdrawals;
CREATE POLICY "withdrawals_update_admin"
ON public.withdrawals FOR UPDATE
TO authenticated USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS "withdrawals_delete_admin" ON public.withdrawals;
CREATE POLICY "withdrawals_delete_admin"
ON public.withdrawals FOR DELETE
TO authenticated USING (public.is_current_user_admin());

CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON public.withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON public.withdrawals(status);
