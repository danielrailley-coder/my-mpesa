import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { supabase, type Task, type Submission } from '@/lib/supabase';
import { PenLine, Brain, Wallet, ArrowLeft, CheckCircle2, AlertCircle, Send, FileText } from 'lucide-react';

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [task, setTask] = useState<Task | null>(null);
  const [existingSubmission, setExistingSubmission] = useState<Submission | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      supabase.from('tasks').select('*').eq('id', id).maybeSingle(),
      user
        ? supabase
            .from('submissions')
            .select('*')
            .eq('task_id', id)
            .eq('user_id', user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]).then(([taskRes, subRes]) => {
      if (taskRes.data) setTask(taskRes.data as Task);
      if (subRes.data) setExistingSubmission(subRes.data as Submission);
      setLoading(false);
    });
  }, [id, user]);

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const targetMet = task && task.word_count_target > 0 ? wordCount >= task.word_count_target * 0.8 : true;

  const handleSubmit = async () => {
    if (!user || !task) return;
    setError(null);
    if (content.trim().length < 50) {
      setError('Your submission must be at least 50 characters long.');
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('submissions').insert({
      task_id: task.id,
      user_id: user.id,
      content: content.trim(),
      word_count: wordCount,
      status: 'approved',
      payout: task.pay_rate,
      reviewed_at: new Date().toISOString(),
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
      setTimeout(() => navigate('/dashboard'), 2500);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Task not found</h1>
        <p className="mt-2 text-slate-600">This task may have been removed or is no longer available.</p>
        <Link to="/tasks" className="mt-4 text-emerald-600 hover:text-emerald-700">← Back to tasks</Link>
      </div>
    );
  }

  if (existingSubmission) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-slate-50/50">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          <Link to="/tasks" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> Back to tasks
          </Link>

          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex items-center justify-center">
              <div className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
                  <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                </div>
                <h2 className="mt-4 text-xl font-bold text-slate-900">Task Completed — You earned ${Number(existingSubmission.payout).toFixed(2)}!</h2>
                <p className="mt-2 text-slate-600">Your earnings from this task are available to withdraw via M-Pesa.</p>
              </div>
            </div>

            <div className="mt-8 rounded-xl bg-slate-50 p-6">
              <h3 className="mb-2 text-sm font-medium text-slate-500">Your Submission</h3>
              <p className="whitespace-pre-wrap text-slate-700">{existingSubmission.content}</p>
            </div>

            <div className="mt-6 flex justify-center">
              <Link to="/tasks" className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700">
                Browse More Tasks
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50/50">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Link to="/tasks" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Back to tasks
        </Link>

        {/* Task header */}
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                task.category === 'writing' ? 'bg-emerald-50 text-emerald-600' : 'bg-sky-50 text-sky-600'
              }`}>
                {task.category === 'writing' ? <PenLine className="h-6 w-6" /> : <Brain className="h-6 w-6" />}
              </div>
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {task.category === 'writing' ? 'Writing Task' : 'AI Training Task'}
                </span>
                {task.subcategory && (
                  <span className="ml-2 text-xs text-slate-400 capitalize">• {task.subcategory.replace(/_/g, ' ')}</span>
                )}
              </div>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-4 py-2 text-base font-bold text-emerald-700">
              <Wallet className="h-4 w-4" />
              ${Number(task.pay_rate).toFixed(2)}
            </span>
          </div>

          <h1 className="mt-5 text-2xl font-bold text-slate-900">{task.title}</h1>
          <p className="mt-4 leading-relaxed text-slate-600">{task.description}</p>

          <div className="mt-6 flex flex-wrap gap-4 border-t border-slate-100 pt-6">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">Difficulty:</span>
              <span className="rounded-md bg-slate-100 px-2.5 py-1 text-sm font-medium capitalize text-slate-700">
                {task.difficulty}
              </span>
            </div>
            {task.word_count_target > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">Target length:</span>
                <span className="rounded-md bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-700">
                  {task.word_count_target} words
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Submission form */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <FileText className="h-5 w-5 text-emerald-600" />
            Submit Your Work
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Write your response below and submit. Your work is approved instantly and the payout is added to your balance immediately.
          </p>

          {success ? (
            <div className="mt-6 flex flex-col items-center gap-4 rounded-xl bg-emerald-50 px-5 py-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-emerald-900">Task Approved — You earned ${Number(task.pay_rate).toFixed(2)}!</p>
                <p className="mt-1 text-sm text-emerald-700">Your earnings are now available to withdraw via M-Pesa. Redirecting to your dashboard...</p>
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div className="mt-6 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={14}
                placeholder="Start writing your response here..."
                className="mt-6 w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-900 placeholder:text-slate-400 transition-colors focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />

              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-3 text-sm">
                  <span className={`font-medium ${targetMet ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {wordCount} words
                  </span>
                  {task.word_count_target > 0 && (
                    <span className="text-slate-400">
                      (target: {task.word_count_target})
                    </span>
                  )}
                  {!targetMet && task.word_count_target > 0 && (
                    <span className="text-amber-600">• {task.word_count_target - wordCount} more to hit target</span>
                  )}
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || content.trim().length < 50}
                  className="group flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-700 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit Work'}
                  {!submitting && <Send className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


