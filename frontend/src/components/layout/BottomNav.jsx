import { NavLink } from 'react-router-dom'
import { TABS } from './TopBar.jsx'

// Mobile-only bottom tab bar. Hidden on md+ where the top nav is used.
export function BottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-surface/95 backdrop-blur border-t border-border">
      <div className="grid grid-cols-4">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 py-2.5 text-label transition-colors ${
                isActive ? 'text-accent' : 'text-text-dim'
              }`
            }
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                'bg-current'
              }`}
            />
            {t.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
