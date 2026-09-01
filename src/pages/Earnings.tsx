import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type Submission, type Withdrawal } from '@/lib/supabase';
import { Wallet, TrendingUp, CheckCircle2, FileText, ArrowDownToLine } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Earnings() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase
        .from('submissions')
        .select('*, task:tasks(*)')
        .eq('user_id', user.id)
        .order('submitted_at', { ascending: false }),
      supabase
        .from('withdrawals')
        .select('*')
        .eq('user_id', user.id)
        .order('requested_at', { ascending: false }),
    ]).then(([subRes, wRes]) => {
      if (subRes.data) setSubmissions(subRes.data as unknown as Submission[]);
      if (wRes.data) setWithdrawals(wRes.data as Withdrawal[]);
      setLoading(false);
    });
  }, [user]);

  const approved = submissions.filter((s) => s.status === 'approved');
  const totalEarnings = approved.reduce((sum, s) => sum + Number(s.payout), 0);
  const totalWithdrawn = withdrawals.filter((w) => w.status === 'completed').reduce((sum, w) => sum + Number(w.amount), 0);
  const pendingWithdrawals = withdrawals.filter((w) => w.status === 'pending' || w.status === 'processing').reduce((sum, w) => sum + Number(w.amount), 0);
  const availableBalance = totalEarnings - totalWithdrawn - pendingWithdrawals;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50/50">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">My Earnings</h1>
          <p className="mt-1 text-slate-600">Track your submissions and payout history.</p>
        </div>

        {/* Summary cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-700">Available Balance</p>
                <p className="mt-1 text-3xl font-bold text-emerald-900">${availableBalance.toFixed(2)}</p>
                {availableBalance >= 10 && (
                  <Link to="/withdraw" className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800">
                    <ArrowDownToLine className="h-4 w-4" /> Withdraw to M-Pesa
                  </Link>
                )}
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
                <p className="mt-1 text-3xl font-bold text-slate-900">${totalEarnings.toFixed(2)}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                <TrendingUp className="h-6 w-6" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Tasks Completed</p>
                <p className="mt-1 text-3xl font-bold text-slate-900">{approved.length}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                <CheckCircle2 className="h-6 w-6" />
              </div>
            </div>
          </div>
        </div>

        {/* Withdraw CTA banner */}
        {availableBalance >= 10 && (
          <div className="mt-6 flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white">
                <ArrowDownToLine className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-emerald-900">Ready to cash out?</p>
                <p className="text-sm text-emerald-700">Withdraw ${availableBalance.toFixed(2)} to your M-Pesa wallet.</p>
              </div>
            </div>
            <Link
              to="/withdraw"
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              Withdraw Now
            </Link>
          </div>
        )}

        {/* Earnings breakdown */}
        <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              Submission History
            </h2>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" />
            </div>
          ) : submissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                <FileText className="h-6 w-6" />
              </div>
              <h3 className="mt-4 font-medium text-slate-900">No submissions yet</h3>
              <p className="mt-1 text-sm text-slate-500">Your earnings will appear here once you start completing tasks.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {submissions.map((sub) => (
                <div key={sub.id} className="px-6 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">
                        {sub.task?.title || 'Untitled task'}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                        <span>{new Date(sub.submitted_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                        <span>•</span>
                        <span>{sub.word_count} words</span>
                        {sub.task && (
                          <>
                            <span>•</span>
                            <span className="capitalize">{sub.task.category.replace(/_/g, ' ')}</span>
                          </>
                        )}
                      </div>
                      {sub.feedback && sub.status === 'rejected' && (
                        <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                          <span className="font-medium">Feedback: </span>{sub.feedback}
                        </div>
                      )}
                      {sub.feedback && sub.status === 'approved' && (
                        <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                          <span className="font-medium">Feedback: </span>{sub.feedback}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {sub.status === 'approved' && (
                        <>
                          <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Approved
                          </span>
                          <span className="text-lg font-bold text-emerald-700">
                            +${Number(sub.payout).toFixed(2)}
                          </span>
                        </>
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
