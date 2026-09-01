import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { supabase, type Submission, type Task, type Withdrawal } from '@/lib/supabase';
import { Wallet, FileText, CheckCircle2, TrendingUp, ArrowRight, PenLine, Brain, ArrowDownToLine } from 'lucide-react';

export default function Dashboard() {
  const { user, profile } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [openTasks, setOpenTasks] = useState<Task[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase
        .from('submissions')
        .select('*, task:tasks(*)')
        .eq('user_id', user.id)
        .order('submitted_at', { ascending: false })
        .limit(5),
      supabase
        .from('tasks')
        .select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(4),
      supabase
        .from('withdrawals')
        .select('*')
        .eq('user_id', user.id)
        .order('requested_at', { ascending: false }),
    ]).then(([subRes, taskRes, wRes]) => {
      if (subRes.data) setSubmissions(subRes.data as unknown as Submission[]);
      if (taskRes.data) setOpenTasks(taskRes.data as Task[]);
      if (wRes.data) setWithdrawals(wRes.data as Withdrawal[]);
      setLoading(false);
    });
  }, [user]);

  const totalEarnings = submissions
    .filter((s) => s.status === 'approved')
    .reduce((sum, s) => sum + Number(s.payout), 0);
  const totalWithdrawn = withdrawals.filter((w) => w.status === 'completed').reduce((sum, w) => sum + Number(w.amount), 0);
  const pendingWithdrawals = withdrawals.filter((w) => w.status === 'pending' || w.status === 'processing').reduce((sum, w) => sum + Number(w.amount), 0);
  const availableBalance = totalEarnings - totalWithdrawn - pendingWithdrawals;

  const approvedCount = submissions.filter((s) => s.status === 'approved').length;

  const stats = [
    {
      label: 'Total Earnings',
      value: `${totalEarnings.toFixed(2)}`,
      icon: Wallet,
      color: 'emerald',
    },
    {
      label: 'Available Balance',
      value: `${availableBalance.toFixed(2)}`,
      icon: ArrowDownToLine,
      color: 'amber',
    },
    {
      label: 'Tasks Completed',
      value: approvedCount,
      icon: CheckCircle2,
      color: 'sky',
    },
  ];

  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    sky: 'bg-sky-50 text-sky-600',
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
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">
            Welcome back, {profile?.full_name || 'Writer'}
          </h1>
          <p className="mt-1 text-slate-600">Here's your earning overview and latest activity.</p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{stat.value}</p>
                </div>
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${colorMap[stat.color]}`}>
                  <stat.icon className="h-6 w-6" />
                </div>
              </div>
            </div>
          ))}
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
                <p className="text-sm text-emerald-700">You have ${availableBalance.toFixed(2)} available to withdraw to M-Pesa.</p>
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

        {/* Available Tasks */}
        <div className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Available Tasks</h2>
            <Link to="/tasks" className="flex items-center gap-1 text-sm font-medium text-emerald-600 hover:text-emerald-700">
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {openTasks.map((task) => (
              <Link
                key={task.id}
                to={`/tasks/${task.id}`}
                className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-emerald-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                      task.category === 'writing' ? 'bg-emerald-50 text-emerald-600' : 'bg-sky-50 text-sky-600'
                    }`}>
                      {task.category === 'writing' ? <PenLine className="h-5 w-5" /> : <Brain className="h-5 w-5" />}
                    </div>
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {task.category === 'writing' ? 'Writing' : 'AI Training'}
                    </span>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                    ${Number(task.pay_rate).toFixed(0)}
                  </span>
                </div>
                <h3 className="mt-3 font-semibold text-slate-900 group-hover:text-emerald-700">{task.title}</h3>
                <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                  <span className="capitalize">{task.difficulty}</span>
                  {task.word_count_target > 0 && <span>• {task.word_count_target} words</span>}
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Submissions */}
        <div className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Recent Submissions</h2>
            <Link to="/earnings" className="flex items-center gap-1 text-sm font-medium text-emerald-600 hover:text-emerald-700">
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {submissions.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                  <FileText className="h-6 w-6" />
                </div>
                <h3 className="mt-4 font-medium text-slate-900">No submissions yet</h3>
                <p className="mt-1 text-sm text-slate-500">Browse tasks and submit your first piece to start earning.</p>
                <Link
                  to="/tasks"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                >
                  Browse Tasks <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {submissions.map((sub) => (
                  <div key={sub.id} className="flex items-center justify-between px-6 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">
                        {sub.task?.title || 'Untitled task'}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-500">
                        {new Date(sub.submitted_at).toLocaleDateString()} • {sub.word_count} words
                      </p>
                    </div>
                    <div className="ml-4 flex items-center gap-3">
                      {sub.status === 'approved' && (
                        <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Approved • ${Number(sub.payout).toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
