export function Input({ className = '', ...props }) {
  return (
    <input
      className={`bg-bg border border-border rounded-md px-3 py-1.5 text-body text-text
        placeholder:text-muted focus:outline-none focus:border-accent ${className}`}
      {...props}
    />
  )
}
