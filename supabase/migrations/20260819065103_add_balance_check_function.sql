/*
# Add Atomic Balance Check Function

## Overview
A SECURITY DEFINER function that atomically verifies a writer has sufficient
available balance for a specific withdrawal, and returns the computed balance.
This prevents race conditions where two concurrent withdrawals could both pass
the balance check and overdraw the account.

## New Functions

### get_available_balance(p_user_id uuid)
- Returns a single numeric value: total approved payouts minus completed withdrawals
  minus any pending/processing withdrawals (excluding the one being processed).
- SECURITY DEFINER so it can read all submissions and withdrawals for the given user
  regardless of RLS context (needed when called from the edge function using the
  service role).

## Security
- SECURITY DEFINER, search_path locked to public.
- Read-only — does not modify any data.
- Safe to call from edge functions with the service role key.
*/

CREATE OR REPLACE FUNCTION public.get_available_balance(p_user_id uuid)
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(
      (SELECT SUM(payout) FROM public.submissions WHERE user_id = p_user_id AND status = 'approved'),
      0
    )
    -
    COALESCE(
      (SELECT SUM(amount) FROM public.withdrawals WHERE user_id = p_user_id AND status = 'completed'),
      0
    )
    -
    COALESCE(
      (SELECT SUM(amount) FROM public.withdrawals WHERE user_id = p_user_id AND status IN ('pending', 'processing')),
      0
    );
$$;
