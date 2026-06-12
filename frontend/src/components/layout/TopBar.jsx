import { NavLink } from 'react-router-dom'

const TABS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/intelligence', label: 'Intelligence' },
  { to: '/settings', label: 'Settings' },
]

export function TopBar() {
  return (
    <header className="border-b border-border bg-surface sticky top-0 z-10">
      <div className="max-w-screen-xl mx-auto px-6 h-14 flex items-center gap-8">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent" />
          <span className="text-head font-semibold tracking-tight">FinoLens</span>
        </div>
        <nav className="flex items-center gap-6">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `text-body transition-colors ${
                  isActive ? 'text-accent' : 'text-text-dim hover:text-text'
                }`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  )
}
