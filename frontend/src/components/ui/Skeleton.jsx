export function Skeleton({ className = '' }) {
  return <div className={`skeleton ${className}`} />
}

// A few stacked skeleton lines for list/table loading states.
export function SkeletonRows({ rows = 5, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  )
}
