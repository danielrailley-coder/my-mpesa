import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { supabase, type Withdrawal, type Submission, MIN_WITHDRAWAL } from '@/lib/supabase';
import PayPalButton from '@/components/PayPalButton';
import { Wallet, ArrowLeft, CheckCircle2, AlertCircle, Loader2, CreditCard } from 'lucide-react';

export default function Checkout() {
  const { user } = useAuth();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [approvedSubs, setApprovedSubs] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const loadData = async () => {
    if (!user) return;
    const [wRes, sRes] = await Promise.all([
      supabase.from('withdrawals').select('*').eq('user_id', user.id).order('requested_at', { ascending: false }),
      supabase.from('submissions').select('payout').eq('user_id', user.id).eq('status', 'approved'),
    ]);
    if (wRes.data) setWithdrawals(wRes.data as Withdrawal[]);
    if (sRes.data) setApprovedSubs(sRes.data as Submission[]);
    setLoading(false);
  };

  useState(() => {
    loadData();
  });

  const totalEarned = approvedSubs.reduce((sum, s) => sum + Number(s.payout), 0);
  const totalWithdrawn = withdrawals
    .filter((w) => w.status === 'completed')
    .reduce((sum, w) => sum + Number(w.amount), 0);
  const pendingWithdrawals = withdrawals
    .filter((w) => w.status === 'pending' || w.status === 'processing')
    .reduce((sum, w) => sum + Number(w.amount), 0);
  const availableBalance = totalEarned - totalWithdrawn - pendingWithdrawals;

  const numAmount = parseFloat(amount) || 0;
  const canPay = numAmount >= MIN_WITHDRAWAL && numAmount <= availableBalance;

  const handleSuccess = async (result: { orderId: string; status: string; captureId?: string }) => {
    setProcessing(true);
    setError(null);

    try {
      const { error: insertError } = await supabase.from('withdrawals').insert({
        user_id: user!.id,
        amount: numAmount,
        phone_number: 'paypal',
        status: 'completed',
        mpesa_reference: result.captureId || result.orderId,
        processed_at: new Date().toISOString(),
      });

      if (insertError) {
        setError('PayPal payment succeeded but we could not record it. Please contact support with PayPal order ID: ' + result.orderId);
      } else {
        setSuccess(`Payment of $${numAmount.toFixed(2)} completed successfully via PayPal. Order ID: ${result.orderId}. Your balance has been updated.`);
        setAmount('');
        await loadData();
      }
    } catch {
      setError('PayPal payment succeeded but an error occurred while saving. Please contact support.');
    }

    setProcessing(false);
  };

  const handleError = (message: string) => {
    setError(message);
    setProcessing(false);
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
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
        <Link to="/withdraw" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" />
          Back to Withdraw
        </Link>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Checkout with PayPal</h1>
          <p className="mt-1 text-slate-600">Withdraw your earnings securely via PayPal.</p>
        </div>

        {/* Balance card */}
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-6 shadow-sm">
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

        {/* Payment form */}
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <CreditCard className="h-5 w-5 text-blue-600" />
            Payment Details
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Enter the amount you'd like to withdraw via PayPal. Minimum: ${MIN_WITHDRAWAL}.00.
          </p>

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

          <div className="mt-6 space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Amount (USD)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-semibold text-slate-400">$</span>
                <input
                  type="number"
                  step="0.01"
                  min={MIN_WITHDRAWAL}
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setError(null);
                    setSuccess(null);
                  }}
                  placeholder="0.00"
                  max={availableBalance}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-8 pr-4 text-slate-900 placeholder:text-slate-400 transition-colors focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-slate-400">Available: ${availableBalance.toFixed(2)}</p>
                <button
                  type="button"
                  onClick={() => setAmount(availableBalance.toFixed(2))}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  Withdraw all
                </button>
              </div>
            </div>

            {/* PayPal Button */}
            {canPay && !success && (
              <div className="space-y-3">
                {processing && (
                  <div className="flex items-center justify-center gap-2 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing your PayPal payment...
                  </div>
                )}
                <PayPalButton
                  amount={numAmount}
                  currency="USD"
                  disabled={processing}
                  onSuccess={handleSuccess}
                  onError={handleError}
                />
              </div>
            )}

            {!canPay && numAmount > 0 && numAmount < MIN_WITHDRAWAL && (
              <p className="text-sm text-amber-600">Minimum withdrawal amount is ${MIN_WITHDRAWAL}.00.</p>
            )}
            {!canPay && numAmount > availableBalance && (
              <p className="text-sm text-red-600">Amount exceeds your available balance.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
