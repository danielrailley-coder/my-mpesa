import { Link } from 'react-router-dom';
import { PenLine, Brain, Wallet, TrendingUp, CheckCircle2, ArrowRight, Sparkles, Clock, Users } from 'lucide-react';

export default function Landing() {
  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-emerald-50/50 via-white to-white">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/4 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-200/30 blur-3xl" />
          <div className="absolute right-1/4 top-20 h-96 w-96 translate-x-1/2 rounded-full bg-teal-200/30 blur-3xl" />
        </div>

        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-medium text-emerald-700">
              <Sparkles className="h-4 w-4" />
              Earn money with your writing skills
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
              Turn your words into{' '}
              <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                real income
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
              Complete paid writing assignments and help train the next generation of AI.
              Work from anywhere, choose your tasks, and get paid instantly for every submission.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                to="/signup"
                className="group inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-600/30"
              >
                Start Earning Today
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/signin"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-8 py-3.5 text-base font-semibold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50"
              >
                Sign In
              </Link>
            </div>
            <div className="mt-12 flex items-center justify-center gap-8 text-sm text-slate-500">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-emerald-600" />
                <span>2,400+ writers</span>
              </div>
              <div className="hidden h-4 w-px bg-slate-200 sm:block" />
              <div className="hidden items-center gap-2 sm:flex">
                <Wallet className="h-4 w-4 text-emerald-600" />
                <span>$180K+ paid out</span>
              </div>
              <div className="hidden h-4 w-px bg-slate-200 sm:block" />
              <div className="hidden items-center gap-2 sm:flex">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                <span>500+ tasks weekly</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="border-t border-slate-100 bg-slate-50/50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              How it works
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              Three simple steps to start earning from your writing.
            </p>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {[
              {
                icon: PenLine,
                step: '01',
                title: 'Create your account',
                desc: 'Sign up for free and set up your writer profile in minutes. No experience required to get started.',
              },
              {
                icon: CheckCircle2,
                step: '02',
                title: 'Pick tasks you love',
                desc: 'Browse hundreds of writing and AI training tasks. Filter by category, pay rate, and difficulty.',
              },
              {
                icon: Wallet,
                step: '03',
                title: 'Submit and get paid instantly',
                desc: 'Complete the task, submit your work, and get paid immediately — no waiting for review. Your earnings are available to withdraw right away.',
              },
            ].map((item) => (
              <div
                key={item.step}
                className="group relative rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition-all hover:shadow-md"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
                  <item.icon className="h-6 w-6" />
                </div>
                <span className="absolute right-6 top-6 text-3xl font-bold text-slate-100">
                  {item.step}
                </span>
                <h3 className="text-xl font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-2 text-slate-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Two columns: Writing + AI Training */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Two ways to earn
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              Whether you love crafting content or shaping AI, there's a task for you.
            </p>
          </div>

          <div className="mt-16 grid gap-8 lg:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-8 lg:p-10">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20">
                <PenLine className="h-7 w-7" />
              </div>
              <h3 className="mt-6 text-2xl font-bold text-slate-900">Writing Tasks</h3>
              <p className="mt-3 text-slate-600">
                Write blog posts, product descriptions, SEO copy, newsletters, and technical docs.
                Get paid per piece based on length and complexity.
              </p>
              <ul className="mt-6 space-y-3">
                {['Blog posts & articles', 'Product descriptions', 'SEO landing pages', 'Newsletters & emails', 'Technical documentation'].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-slate-700">
                    <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-600" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-8 inline-flex items-center gap-2 rounded-lg bg-white/60 px-4 py-2 text-sm font-medium text-emerald-700">
                <Wallet className="h-4 w-4" />
                $18 – $60 per task
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-sky-50 to-blue-50 p-8 lg:p-10">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-lg shadow-sky-600/20">
                <Brain className="h-7 w-7" />
              </div>
              <h3 className="mt-6 text-2xl font-bold text-slate-900">AI Training Tasks</h3>
              <p className="mt-3 text-slate-600">
                Help train AI models by writing responses, rating outputs, fact-checking claims,
                classifying content, and evaluating model creativity.
              </p>
              <ul className="mt-6 space-y-3">
                {['Write prompt responses', 'Rate & rewrite AI outputs', 'Fact-check AI claims', 'Classify sentiment & content', 'Evaluate model creativity'].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-slate-700">
                    <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-sky-600" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-8 inline-flex items-center gap-2 rounded-lg bg-white/60 px-4 py-2 text-sm font-medium text-sky-700">
                <Wallet className="h-4 w-4" />
                $22 – $50 per task
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing / Earning potential */}
      <section id="pricing" className="border-t border-slate-100 bg-slate-50/50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              What you can earn
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              Transparent pricing. You see the pay rate before you start any task.
            </p>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {[
              {
                tier: 'Casual',
                icon: Clock,
                tasks: '5–10 tasks / week',
                range: '$150 – $400',
                monthly: 'per month',
                features: ['Pick tasks anytime', 'No minimum commitment', 'Flexible categories'],
                highlight: false,
              },
              {
                tier: 'Active Writer',
                icon: TrendingUp,
                tasks: '15–25 tasks / week',
                range: '$600 – $1,200',
                monthly: 'per month',
                features: ['Priority task access', 'All categories unlocked', 'Faster payouts', 'Performance bonuses'],
                highlight: true,
              },
              {
                tier: 'Expert',
                icon: Sparkles,
                tasks: '30+ tasks / week',
                range: '$1,500+',
                monthly: 'per month',
                features: ['Premium high-pay tasks', 'Hard difficulty unlocked', 'Top-tier payouts', 'Dedicated support'],
                highlight: false,
              },
            ].map((plan) => (
              <div
                key={plan.tier}
                className={`relative rounded-2xl border p-8 transition-all ${
                  plan.highlight
                    ? 'border-emerald-600 bg-white shadow-xl shadow-emerald-600/10 scale-105'
                    : 'border-slate-200 bg-white shadow-sm hover:shadow-md'
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-600 px-4 py-1 text-xs font-semibold text-white">
                    Most Popular
                  </div>
                )}
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                  plan.highlight ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  <plan.icon className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-slate-900">{plan.tier}</h3>
                <p className="text-sm text-slate-500">{plan.tasks}</p>
                <div className="mt-4">
                  <span className="text-3xl font-bold text-slate-900">{plan.range}</span>
                  <span className="ml-1 text-sm text-slate-500">{plan.monthly}</span>
                </div>
                <ul className="mt-6 space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-slate-600">
                      <CheckCircle2 className={`h-4 w-4 flex-shrink-0 ${plan.highlight ? 'text-emerald-600' : 'text-slate-400'}`} />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-700 px-8 py-16 text-center shadow-2xl shadow-emerald-600/20">
            <div className="absolute inset-0 -z-10 opacity-20">
              <div className="absolute left-0 top-0 h-48 w-48 rounded-full bg-white/20 blur-2xl" />
              <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-white/20 blur-3xl" />
            </div>
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              Ready to start earning?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-emerald-50">
              Join thousands of writers making money from their words. It's free to sign up and start working.
            </p>
            <Link
              to="/signup"
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-emerald-700 shadow-lg transition-all hover:bg-emerald-50 hover:shadow-xl"
            >
              Create Free Account
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2 text-slate-900">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600">
                <PenLine className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold">WriteEarn</span>
            </div>
            <p className="text-sm text-slate-500">
              © 2026 WriteEarn. Earn money with your writing and AI training skills.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
