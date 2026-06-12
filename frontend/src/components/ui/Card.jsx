export function Card({ children, className = '', elevated = false }) {
  return (
    <div
      className={`${elevated ? 'bg-elevated' : 'bg-surface'} border border-border rounded-md shadow-card ${className}`}
    >
      {children}
    </div>
  )
}

export function CardLabel({ children }) {
  return (
    <div className="text-label uppercase tracking-[0.08em] text-muted font-medium">{children}</div>
  )
}
