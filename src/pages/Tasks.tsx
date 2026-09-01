import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, type Task } from '@/lib/supabase';
import { PenLine, Brain, Search, Wallet, ArrowRight, Filter } from 'lucide-react';

type CategoryFilter = 'all' | 'writing' | 'ai_training';
type DifficultyFilter = 'all' | 'easy' | 'medium' | 'hard';

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [difficulty, setDifficulty] = useState<DifficultyFilter>('all');

  useEffect(() => {
    supabase
      .from('tasks')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setTasks(data as Task[]);
        setLoading(false);
      });
  }, []);

  const filtered = tasks.filter((t) => {
    const matchSearch = t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase());
    const matchCategory = category === 'all' || t.category === category;
    const matchDifficulty = difficulty === 'all' || t.difficulty === difficulty;
    return matchSearch && matchCategory && matchDifficulty;
  });

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50/50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Browse Tasks</h1>
          <p className="mt-1 text-slate-600">Find writing and AI training tasks that match your skills.</p>
        </div>

        {/* Filters */}
        <div className="mb-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks by title or description..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-slate-900 placeholder:text-slate-400 transition-colors focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-600">Category:</span>
            </div>
            {(['all', 'writing', 'ai_training'] as CategoryFilter[]).map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  category === cat
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat === 'all' ? 'All' : cat === 'writing' ? 'Writing' : 'AI Training'}
              </button>
            ))}

            <div className="mx-2 h-6 w-px bg-slate-200" />

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-600">Difficulty:</span>
            </div>
            {(['all', 'easy', 'medium', 'hard'] as DifficultyFilter[]).map((diff) => (
              <button
                key={diff}
                onClick={() => setDifficulty(diff)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                  difficulty === diff
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {diff}
              </button>
            ))}
          </div>
        </div>

        {/* Results count */}
        <p className="mb-4 text-sm text-slate-500">
          {filtered.length} task{filtered.length !== 1 ? 's' : ''} found
        </p>

        {/* Task grid */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-20 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
              <Search className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-medium text-slate-900">No tasks found</h3>
            <p className="mt-1 text-sm text-slate-500">Try adjusting your filters or search terms.</p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((task) => (
              <Link
                key={task.id}
                to={`/tasks/${task.id}`}
                className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-emerald-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      task.category === 'writing' ? 'bg-emerald-50 text-emerald-600' : 'bg-sky-50 text-sky-600'
                    }`}>
                      {task.category === 'writing' ? <PenLine className="h-5 w-5" /> : <Brain className="h-5 w-5" />}
                    </div>
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {task.category === 'writing' ? 'Writing' : 'AI Training'}
                    </span>
                  </div>
                  <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">
                    <Wallet className="h-3.5 w-3.5" />
                    ${Number(task.pay_rate).toFixed(0)}
                  </span>
                </div>

                <h3 className="mt-4 font-semibold text-slate-900 group-hover:text-emerald-700">
                  {task.title}
                </h3>
                <p className="mt-2 line-clamp-3 flex-1 text-sm text-slate-600">
                  {task.description}
                </p>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="capitalize rounded-md bg-slate-100 px-2 py-1 font-medium">{task.difficulty}</span>
                    {task.word_count_target > 0 && <span>{task.word_count_target} words</span>}
                    {task.subcategory && <span className="capitalize">{task.subcategory.replace(/_/g, ' ')}</span>}
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-400 transition-all group-hover:translate-x-0.5 group-hover:text-emerald-600" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
