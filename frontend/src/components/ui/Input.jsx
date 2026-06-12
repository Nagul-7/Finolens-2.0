export function Input({ className = '', ...props }) {
  return (
    <input
      className={`bg-bg border border-border rounded-md px-3.5 py-2 text-body text-text
        placeholder:text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40
        transition-colors ${className}`}
      {...props}
    />
  )
}
