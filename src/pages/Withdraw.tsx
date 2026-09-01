import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type Withdrawal, type Submission, MIN_WITHDRAWAL } from '@/lib/supabase';
import { Wallet, Smartphone, ArrowDownToLine, Clock, CheckCircle2, XCircle, AlertCircle, Loader2, TrendingUp, RotateCw, CreditCard } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Withdraw() {
  const { user } = useAuth();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [approvedSubs, setApprovedSubs] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase
        .from('withdrawals')
        .select('*')
        .eq('user_id', user.id)
        .order('requested_at', { ascending: false }),
      supabase
        .from('submissions')
        .select('payout')
        .eq('user_id', user.id)
        .eq('status', 'approved'),
    ]).then(([wRes, sRes]) => {
      if (wRes.data) setWithdrawals(wRes.data as Withdrawal[]);
      if (sRes.data) setApprovedSubs(sRes.data as Submission[]);
      setLoading(false);
    });
  }, [user]);

  const totalEarned = approvedSubs.reduce((sum, s) => sum + Number(s.payout), 0);
  const totalWithdrawn = withdrawals
    .filter((w) => w.status === 'completed')
    .reduce((sum, w) => sum + Number(w.amount), 0);
  const pendingWithdrawals = withdrawals
    .filter((w) => w.status === 'pending' || w.status === 'processing')
    .reduce((sum, w) => sum + Number(w.amount), 0);
  const availableBalance = totalEarned - totalWithdrawn - pendingWithdrawals;

  const [retryingId, setRetryingId] = useState<string | null>(null);

  const refreshData = async () => {
    const [wRes, sRes] = await Promise.all([
      supabase.from('withdrawals').select('*').eq('user_id', user!.id).order('requested_at', { ascending: false }),
      supabase.from('submissions').select('payout').eq('user_id', user!.id).eq('status', 'approved'),
    ]);
    if (wRes.data) setWithdrawals(wRes.data as Withdrawal[]);
    if (sRes.data) setApprovedSubs(sRes.data as Submission[]);
  };

  const processWithdrawal = async (withdrawalId: string, phone: string, amountNum: number): Promise<{ success: boolean; message: string }> => {
    const funcUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mpesa-withdraw`;
    const { data: sessionData } = await supabase.auth.getSession();

    try {
      const response = await fetch(funcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.session?.access_token}`,
        },
        body: JSON.stringify({ withdrawal_id: withdrawalId }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        return { success: true, message: `${amountNum.toFixed(2)} has been sent to your M-Pesa (${phone}). M-Pesa Reference: ${result.mpesa_reference}. Your money is available now.` };
      } else {
        return { success: false, message: result.error || 'The M-Pesa transfer failed. No money was deducted from your balance.' };
      }
    } catch {
      return { success: false, message: 'We could not reach the M-Pesa service right now. Please try again in a moment. No money has been deducted.' };
    }
  };

  const handleRetry = async (withdrawal: Withdrawal) => {
    setRetryingId(withdrawal.id);
    setError(null);
    setSuccess(null);

    // Reset the failed withdrawal back to pending
    const { error: resetError } = await supabase
      .from('withdrawals')
      .update({ status: 'pending', failure_reason: '' })
      .eq('id', withdrawal.id)
      .eq('status', 'failed');

    if (resetError) {
      setError('Could not retry this withdrawal. Please contact support.');
      setRetryingId(null);
      return;
    }

    const result = await processWithdrawal(withdrawal.id, withdrawal.phone_number, Number(withdrawal.amount));
    await refreshData();

    if (result.success) {
      setSuccess(result.message);
    } else {
      setError(result.message);
    }
    setRetryingId(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount < MIN_WITHDRAWAL) {
      setError(`Minimum withdrawal amount is $${MIN_WITHDRAWAL}.00`);
      return;
    }
    if (numAmount > availableBalance) {
      setError(`You can withdraw up to $${availableBalance.toFixed(2)} from your available balance.`);
      return;
    }
    const phone = phoneNumber.replace(/\s/g, '');
    if (!/^254\d{9}$/.test(phone)) {
      setError('Please enter a valid M-Pesa number in the format 254712345678 (no + sign).');
      return;
    }

    setSubmitting(true);

    // 1. Insert the withdrawal as pending
    const { data: insertData, error: insertError } = await supabase
      .from('withdrawals')
      .insert({
        user_id: user!.id,
        amount: numAmount,
        phone_number: phone,
        status: 'pending',
      })
      .select('id')
      .single();

    if (insertError || !insertData) {
      setError(insertError?.message || 'Failed to create withdrawal request.');
      setSubmitting(false);
      return;
    }

    const withdrawalId = insertData.id;

    // 2. Call the edge function to process this specific withdrawal immediately
    const result = await processWithdrawal(withdrawalId, phone, numAmount);

    // 3. Refresh data to show updated balance and history
    await refreshData();

    if (!result.success) {
      setError(result.message);
    } else {
      setSuccess(result.message);
    }
    setAmount('');
    setSubmitting(false);
  };

  const statusBadge = (status: Withdrawal['status']) => {
    const map = {
      pending: { icon: Clock, text: 'Pending', class: 'bg-amber-50 text-amber-700' },
      processing: { icon: Loader2, text: 'Processing', class: 'bg-sky-50 text-sky-700' },
      completed: { icon: CheckCircle2, text: 'Completed', class: 'bg-emerald-50 text-emerald-700' },
      failed: { icon: XCircle, text: 'Failed', class: 'bg-red-50 text-red-700' },
    };
    const s = map[status];
    return (
      <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${s.class}`}>
        <s.icon className={`h-3.5 w-3.5 ${status === 'processing' ? 'animate-spin' : ''}`} />
        {s.text}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50/50">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Withdraw to M-Pesa</h1>
          <p className="mt-1 text-slate-600">Cash out your earnings directly to your M-Pesa wallet.</p>
        </div>

        {/* Balance cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-700">Available Balance</p>
                <p className="mt-1 text-3xl font-bold text-emerald-900">${availableBalance.toFixed(2)}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-white">
                <Wallet className="h-6 w-6" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Total Earned</p>
                <p className="mt-1 text-3xl font-bold text-slate-900">${totalEarned.toFixed(2)}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                <TrendingUp className="h-6 w-6" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Pending Withdrawals</p>
                <p className="mt-1 text-3xl font-bold text-slate-900">${pendingWithdrawals.toFixed(2)}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <Clock className="h-6 w-6" />
              </div>
            </div>
          </div>
        </div>

        {/* Withdrawal form */}
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <ArrowDownToLine className="h-5 w-5 text-emerald-600" />
            Request Withdrawal
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Enter your M-Pesa phone number and the amount you'd like to withdraw. Minimum: ${MIN_WITHDRAWAL}.00.
          </p>

          <div className="mt-4 flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-3">
            <CreditCard className="h-5 w-5 flex-shrink-0 text-blue-600" />
            <p className="text-sm text-blue-700">
              Prefer PayPal?{' '}
              <Link to="/checkout" className="font-semibold underline hover:text-blue-800">
                Withdraw via PayPal Checkout
              </Link>
            </p>
          </div>

          {error && (
            <div className="mt-6 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {success && (
            <div className="mt-6 flex items-start gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">M-Pesa Phone Number</label>
              <div className="relative">
                <Smartphone className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  required
                  placeholder="254712345678"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-slate-900 placeholder:text-slate-400 transition-colors focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                Enter your number in international format without the + sign (e.g. 254712345678).
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Amount (USD)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-semibold text-slate-400">$</span>
                <input
                  type="number"
                  step="0.01"
                  min={MIN_WITHDRAWAL}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  placeholder="0.00"
                  max={availableBalance}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-8 pr-4 text-slate-900 placeholder:text-slate-400 transition-colors focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-slate-400">Available: ${availableBalance.toFixed(2)}</p>
                <button
                  type="button"
                  onClick={() => setAmount(availableBalance.toFixed(2))}
                  className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
                >
                  Withdraw all
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || availableBalance < MIN_WITHDRAWAL}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 font-semibold text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-700 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <ArrowDownToLine className="h-5 w-5" />
                  Withdraw to M-Pesa
                </>
              )}
            </button>
          </form>
        </div>

        {/* Withdrawal history */}
        <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Wallet className="h-5 w-5 text-emerald-600" />
              Withdrawal History
            </h2>
          </div>

          {withdrawals.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                <ArrowDownToLine className="h-6 w-6" />
              </div>
              <h3 className="mt-4 font-medium text-slate-900">No withdrawals yet</h3>
              <p className="mt-1 text-sm text-slate-500">Your withdrawal history will appear here once you cash out.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {withdrawals.map((w) => (
                <div key={w.id} className="px-6 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-slate-900">${Number(w.amount).toFixed(2)}</span>
                        <span className="text-sm text-slate-400">→ {w.phone_number}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {new Date(w.requested_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {w.mpesa_reference && w.status === 'completed' && (
                        <p className="mt-1 text-xs font-medium text-emerald-600">Ref: {w.mpesa_reference}</p>
                      )}
                      {w.failure_reason && w.status === 'failed' && (
                        <p className="mt-1 text-xs text-red-600">{w.failure_reason}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {statusBadge(w.status)}
                      {w.status === 'failed' && (
                        <button
                          onClick={() => handleRetry(w)}
                          disabled={retryingId === w.id}
                          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
                        >
                          {retryingId === w.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCw className="h-3.5 w-3.5" />
                          )}
                          Retry
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
