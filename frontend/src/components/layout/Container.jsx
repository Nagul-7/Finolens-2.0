export function Container({ children, className = '' }) {
  return <div className={`max-w-screen-xl mx-auto px-6 py-6 ${className}`}>{children}</div>
}
