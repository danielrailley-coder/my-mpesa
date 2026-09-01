import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { PenLine, LogOut, LayoutDashboard, FileText, Wallet, Menu, X, ArrowDownToLine, type LucideIcon } from 'lucide-react';
import { useState } from 'react';

type NavLink = { to: string; label: string; icon?: LucideIcon };

export default function Navbar() {
  const { user, profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const navLinks: NavLink[] = user
    ? [
        { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/tasks', label: 'Browse Tasks', icon: FileText },
        { to: '/earnings', label: 'My Earnings', icon: Wallet },
        { to: '/withdraw', label: 'Withdraw', icon: ArrowDownToLine },
      ]
    : [
        { to: '/#how-it-works', label: 'How It Works' },
        { to: '/#pricing', label: 'Pricing' },
      ];

  const isActive = (path: string) => {
    if (path.startsWith('/#')) return false;
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/80 backdrop-blur-lg">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2 text-slate-900">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-sm">
            <PenLine className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight">WriteEarn</span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) =>
            link.icon ? (
              <Link
                key={link.to}
                to={link.to}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive(link.to)
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            ) : (
              <a
                key={link.to}
                href={link.to}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                {link.label}
              </a>
            )
          )}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <>
              <span className="text-sm text-slate-500">
                Hi, <span className="font-medium text-slate-700">{profile?.full_name || 'Writer'}</span>
              </span>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </>
          ) : (
            <>
              <Link to="/signin" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900">
                Sign In
              </Link>
              <Link
                to="/signup"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 hover:shadow-md"
              >
                Get Started
              </Link>
            </>
          )}
        </div>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {mobileOpen && (
        <div className="border-t border-slate-200 bg-white px-4 py-4 md:hidden">
          <div className="flex flex-col gap-2">
            {navLinks.map((link) =>
              link.icon ? (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.to}
                  href={link.to}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  {link.label}
                </a>
              )
            )}
            {user ? (
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            ) : (
              <div className="flex flex-col gap-2 pt-2">
                <Link to="/signin" onClick={() => setMobileOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-center text-sm font-medium text-slate-600">
                  Sign In
                </Link>
                <Link to="/signup" onClick={() => setMobileOpen(false)} className="rounded-lg bg-emerald-600 px-4 py-2 text-center text-sm font-semibold text-white">
                  Get Started
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
