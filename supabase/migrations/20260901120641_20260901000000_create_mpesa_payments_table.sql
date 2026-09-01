/*
# Create mpesa_payments table for M-PESA STK Push customer payments

## Overview
Tracks incoming customer payments via Safaricom Daraja STK Push. This is distinct
from the existing `withdrawals` table, which tracks money flowing OUT to writers.
A payment row is created as 'pending' by the edge function (using the service role
key) after validating the request and before initiating the STK Push. The edge function
then updates it to 'completed' or 'failed' when Safaricom's callback arrives.

Customers NEVER insert or update payment rows directly. All writes go through the
edge function, which uses the service role key and bypasses RLS.

## New Tables
### mpesa_payments
- `id` (uuid, PK)
- `user_id` (uuid, nullable, FK to auth.users) — the logged-in customer, or NULL for guest checkout
- `phone_number` (text, not null) — M-Pesa phone number in format 2547XXXXXXXX
- `amount` (numeric(10,2), not null) — payment amount, must be > 0
- `status` (text, not null, default 'pending') — 'pending', 'completed', or 'failed'
- `checkout_request_id` (text, default '') — Safaricom's CheckoutRequestID for callback reconciliation
- `merchant_request_id` (text, default '') — Safaricom's MerchantRequestID
- `mpesa_receipt` (text, default '') — M-Pesa receipt number returned on success
- `failure_reason` (text, default '') — reason if the payment failed
- `created_at` (timestamptz, default now())
- `completed_at` (timestamptz) — when the payment reached a final state

## Constraints
- `mpesa_payments_amount_check` — amount must be greater than zero
- `mpesa_payments_status_check` — status must be pending, completed, or failed
- Partial unique index on `checkout_request_id` (excluding empty strings) so the same
  STK transaction cannot create duplicate payment records

## Indexes
- `uniq_mpesa_payments_checkout_request_id` (unique, partial) on `checkout_request_id` WHERE != ''
- `idx_mpesa_payments_status` on `status`
- `idx_mpesa_payments_user_id` on `user_id`

## Security
- RLS enabled on mpesa_payments.
- SELECT: customers can read their own payments; admins can read all.
- INSERT: NO policy for authenticated users. Only the edge function (service role,
  bypasses RLS) creates payment rows. Customers cannot insert, so they cannot create
  a fake 'completed' row or supply a fake receipt.
- UPDATE: admins only. The edge function uses the service role key (bypasses RLS) to
  update status, receipt, and failure_reason from Safaricom's callback.
- DELETE: admins only.

## Important Notes
1. The edge function uses the service role key, which bypasses RLS, so it can insert
   and update freely. Customers using the anon-key frontend cannot write at all.
2. user_id is nullable to support guest checkout (payment without a logged-in account).
3. The partial unique index on checkout_request_id excludes empty strings because rows
   are created with '' before the STK response returns an ID; once the ID is set, it
   must be unique.
4. The existing `withdrawals` table and `mpesa-withdraw` function are NOT modified.
*/

CREATE TABLE IF NOT EXISTS public.mpesa_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  phone_number text NOT NULL,
  amount numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  checkout_request_id text NOT NULL DEFAULT '',
  merchant_request_id text NOT NULL DEFAULT '',
  mpesa_receipt text NOT NULL DEFAULT '',
  failure_reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT mpesa_payments_amount_check CHECK (amount > 0)
);

ALTER TABLE public.mpesa_payments ENABLE ROW LEVEL SECURITY;

-- SELECT: customers see their own payments, admins see all
DROP POLICY IF EXISTS "mpesa_payments_select_own_or_admin" ON public.mpesa_payments;
CREATE POLICY "mpesa_payments_select_own_or_admin"
ON public.mpesa_payments FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_current_user_admin());

-- UPDATE: admins only (the edge function uses the service role key, which bypasses RLS)
DROP POLICY IF EXISTS "mpesa_payments_update_admin" ON public.mpesa_payments;
CREATE POLICY "mpesa_payments_update_admin"
ON public.mpesa_payments FOR UPDATE
TO authenticated
USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());

-- DELETE: admins only
DROP POLICY IF EXISTS "mpesa_payments_delete_admin" ON public.mpesa_payments;
CREATE POLICY "mpesa_payments_delete_admin"
ON public.mpesa_payments FOR DELETE
TO authenticated
USING (public.is_current_user_admin());

-- Partial unique index: checkout_request_id must be unique once set (excludes empty defaults)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_mpesa_payments_checkout_request_id
ON public.mpesa_payments(checkout_request_id)
WHERE checkout_request_id != '';

CREATE INDEX IF NOT EXISTS idx_mpesa_payments_status ON public.mpesa_payments(status);
CREATE INDEX IF NOT EXISTS idx_mpesa_payments_user_id ON public.mpesa_payments(user_id);