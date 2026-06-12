export function Card({ children, className = '' }) {
  return (
    <div className={`bg-surface border border-border rounded-md ${className}`}>{children}</div>
  )
}

export function CardLabel({ children }) {
  return <div className="text-label uppercase tracking-wide text-text-dim">{children}</div>
}
