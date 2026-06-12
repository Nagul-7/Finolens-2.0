import { NavLink } from 'react-router-dom'

export const TABS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/intelligence', label: 'Intelligence' },
  { to: '/settings', label: 'Settings' },
]

export function TopBar() {
  return (
    <header className="border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-20">
      <div className="max-w-screen-xl mx-auto px-5 sm:px-6 h-14 flex items-center gap-8">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent" />
          <span className="text-head font-semibold tracking-tight">FinoLens</span>
        </div>
        {/* Desktop nav — hidden on mobile (bottom bar takes over) */}
        <nav className="hidden md:flex items-center gap-7">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `text-body transition-colors duration-150 ${
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
